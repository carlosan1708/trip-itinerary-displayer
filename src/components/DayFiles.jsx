import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useT } from '../i18n'

const MAX_FILE_SIZE = 700 * 1024

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeLabel(ts) {
  if (!ts?.toMillis) return '...'
  return new Date(ts.toMillis()).toLocaleString()
}

export default function DayFiles({ tripId, gatewayTripId, dayNumber, user, isAdmin }) {
  const t = useT()
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    if (!gatewayTripId || !dayNumber) return
    const q = query(
      collection(db, 'trips', gatewayTripId, 'files'),
      where('tripId', '==', tripId),
    )
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.dayNumber === dayNumber)
      docs.sort((a, b) => (b.uploadedAt?.toMillis() ?? 0) - (a.uploadedAt?.toMillis() ?? 0))
      setFiles(docs)
    })
    return unsub
  }, [dayNumber, gatewayTripId, tripId])

  const helperText = useMemo(() => {
    return t('maxFileSizeHint', { size: formatBytes(MAX_FILE_SIZE) })
  }, [t])

  function promptUpload() {
    fileRef.current?.click()
  }

  function downloadFile(file) {
    const a = document.createElement('a')
    a.href = file.dataUrl
    a.download = file.name || `day-${dayNumber}`
    a.click()
  }

  async function removeFile(fileId) {
    await deleteDoc(doc(db, 'trips', gatewayTripId, 'files', fileId))
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError(t('fileTooLarge', { size: formatBytes(file.size), helperText }))
      return
    }

    setUploading(true)
    setError('')

    const reader = new FileReader()
    reader.onload = async e => {
      try {
        await addDoc(collection(db, 'trips', gatewayTripId, 'files'), {
          tripId,
          dayNumber,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: e.target.result,
          authorEmail: user.email,
          authorName: user.displayName ?? user.email,
          uploadedAt: serverTimestamp(),
        })
      } catch (err) {
        setError(err?.message || t('uploadFileError'))
      } finally {
        setUploading(false)
      }
    }
    reader.onerror = () => {
      setUploading(false)
      setError(t('readFileError'))
    }
    reader.readAsDataURL(file)
  }

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed #e8e8e8' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.68rem', letterSpacing: 1 }}>
            {t('dayFilesSection')}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {helperText}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon fontSize="small" />}
          onClick={promptUpload}
          disabled={uploading}
        >
          {uploading ? t('uploadingBtn') : t('uploadFileAction')}
        </Button>
      </Box>

      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={handleFileChange}
      />

      {uploading && <LinearProgress sx={{ mt: 1.25, borderRadius: 999 }} />}
      {error && <Alert severity="error" sx={{ mt: 1.25, py: 0.5 }}>{error}</Alert>}

      {files.length === 0 ? (
        <Typography
          variant="body2"
          color="text.disabled"
          sx={{ mt: 1.25, fontStyle: 'italic', fontSize: '0.82rem' }}
        >
          {t('noFilesMsg')}
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1.25 }}>
          {files.map(file => {
            const canDelete = isAdmin || file.authorEmail === user.email

            return (
              <Box
                key={file.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  border: '1px solid #e6ebf0',
                  borderRadius: 2,
                  px: 1.25,
                  py: 1,
                  bgcolor: '#fafbfd',
                }}
              >
                <InsertDriveFileIcon sx={{ color: '#5f6b7a', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {formatBytes(file.size)} · {timeLabel(file.uploadedAt)}
                  </Typography>
                </Box>
                <Tooltip title={t('downloadTooltip')}>
                  <IconButton size="small" onClick={() => downloadFile(file)}>
                    <DownloadIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                {canDelete && (
                  <Tooltip title={t('deleteTooltip')}>
                    <IconButton size="small" color="error" onClick={() => removeFile(file.id)}>
                      <DeleteIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}

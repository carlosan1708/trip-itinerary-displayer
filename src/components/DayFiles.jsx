import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
import { useT } from '../i18n'

const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_TAGS = 5
const SUGGESTION_KEYS = ['tagVisa', 'tagHotel', 'tagFlight', 'tagBooking', 'tagInsurance', 'tagMap', 'tagOther']

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeLabel(ts) {
  if (!ts?.toMillis) return '...'
  return new Date(ts.toMillis()).toLocaleString()
}

function TagInput({ tags, onChange, suggestions }) {
  const t = useT()
  const [input, setInput] = useState('')

  function addTag(val) {
    const trimmed = val.trim().toLowerCase()
    if (!trimmed || tags.includes(trimmed) || tags.length >= MAX_TAGS) return
    onChange([...tags, trimmed])
  }

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
      setInput('')
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
        {suggestions.map(s => {
          const key = s.toLowerCase()
          const active = tags.includes(key)
          return (
            <Chip
              key={s}
              label={s}
              size="small"
              variant={active ? 'filled' : 'outlined'}
              color={active ? 'primary' : 'default'}
              onClick={() => active ? removeTag(key) : addTag(s)}
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
          )
        })}
      </Box>
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center',
        border: '1px solid #e0e0e0', borderRadius: 1.5, px: 1, py: 0.5,
        minHeight: 34, bgcolor: '#fff',
      }}>
        {tags.map(tag => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onDelete={() => removeTag(tag)}
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        ))}
        {tags.length < MAX_TAGS && (
          <InputBase
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) { addTag(input); setInput('') } }}
            placeholder={tags.length === 0 ? t('fileTagsPlaceholder') : ''}
            sx={{ fontSize: '0.8rem', flex: 1, minWidth: 80 }}
          />
        )}
      </Box>
      {tags.length >= MAX_TAGS && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
          {t('fileTagsMax', { max: MAX_TAGS })}
        </Typography>
      )}
    </Box>
  )
}

export default function DayFiles({ tripId, gatewayTripId, dayNumber, user, isAdmin, files }) {
  const t = useT()
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingTags, setPendingTags] = useState([])
  const [activeFilters, setActiveFilters] = useState([])
  const [editingFileId, setEditingFileId] = useState(null)
  const [editTags, setEditTags] = useState([])
  const fileRef = useRef()

  const suggestions = useMemo(() => SUGGESTION_KEYS.map(k => t(k)), [t])

  const helperText = useMemo(() => t('maxFileSizeHint', { size: formatBytes(MAX_FILE_SIZE) }), [t])

  const allTags = useMemo(() => {
    const set = new Set()
    files.forEach(f => (f.tags ?? []).forEach(tag => set.add(tag)))
    return [...set].sort()
  }, [files])

  const visibleFiles = useMemo(() => {
    if (activeFilters.length === 0) return files
    return files.filter(f => (f.tags ?? []).some(tag => activeFilters.includes(tag)))
  }, [files, activeFilters])

  function promptUpload() {
    if (!pendingFile) fileRef.current?.click()
  }

  async function downloadFile(file) {
    const url = file.storageUrl || file.dataUrl
    if (!url) return
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name || `day-${dayNumber}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function removeFile(file) {
    if (file.storagePath) {
      await deleteObject(storageRef(storage, file.storagePath)).catch(() => {})
    }
    await deleteDoc(doc(db, 'trips', gatewayTripId, 'files', file.id))
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setError(t('fileTooLarge', { size: formatBytes(file.size), helperText }))
      return
    }
    setError('')
    setPendingFile(file)
    setPendingTags([])
  }

  async function confirmUpload() {
    if (!pendingFile) return
    setUploading(true)
    try {
      const path = `trips/${gatewayTripId}/files/${Date.now()}_${pendingFile.name}`
      const sRef = storageRef(storage, path)
      const snapshot = await uploadBytes(sRef, pendingFile)
      const storageUrl = await getDownloadURL(snapshot.ref)
      await addDoc(collection(db, 'trips', gatewayTripId, 'files'), {
        tripId,
        dayNumber,
        name: pendingFile.name,
        type: pendingFile.type || 'application/octet-stream',
        size: pendingFile.size,
        storageUrl,
        storagePath: snapshot.ref.fullPath,
        authorEmail: user.email,
        authorName: user.displayName ?? user.email,
        uploadedAt: serverTimestamp(),
        tags: pendingTags,
      })
      setPendingFile(null)
      setPendingTags([])
    } catch (err) {
      setError(err?.message || t('uploadFileError'))
    } finally {
      setUploading(false)
    }
  }

  function cancelPending() {
    setPendingFile(null)
    setPendingTags([])
    setError('')
  }

  function startEditTags(file) {
    setEditingFileId(file.id)
    setEditTags(file.tags ?? [])
  }

  async function saveEditTags(fileId) {
    await updateDoc(doc(db, 'trips', gatewayTripId, 'files', fileId), { tags: editTags })
    setEditingFileId(null)
  }

  function toggleFilter(tag) {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed #e8e8e8' }}>
      {/* Header row */}
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
          startIcon={<UploadFileIcon fontSize="small" />}
          onClick={promptUpload}
          disabled={uploading || !!pendingFile}
        >
          {t('uploadFileAction')}
        </Button>
      </Box>

      <input ref={fileRef} type="file" hidden onChange={handleFileChange} />

      {error && <Alert severity="error" sx={{ mt: 1.25, py: 0.5 }}>{error}</Alert>}

      {/* Pending upload panel */}
      {pendingFile && (
        <Box
          data-testid="pending-upload"
          sx={{ mt: 1.25, border: '1px dashed #c5cae9', borderRadius: 2, p: 1.5, bgcolor: '#f8f9ff' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <InsertDriveFileIcon sx={{ color: '#5f6b7a', fontSize: 18, flexShrink: 0 }} />
            <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
              {pendingFile.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatBytes(pendingFile.size)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            {t('fileTagsLabel')}
          </Typography>
          <TagInput tags={pendingTags} onChange={setPendingTags} suggestions={suggestions} />
          {uploading && <LinearProgress sx={{ mt: 1, borderRadius: 999 }} />}
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={cancelPending} disabled={uploading}>
              {t('cancel')}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={confirmUpload}
              disabled={uploading}
              startIcon={uploading ? <CircularProgress size={12} /> : null}
            >
              {uploading ? t('uploadingBtn') : t('confirmUpload')}
            </Button>
          </Box>
        </Box>
      )}

      {/* Tag filter row */}
      {allTags.length > 0 && (
        <Box
          data-testid="tag-filter-row"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {t('fileTagFilterLabel')}
          </Typography>
          {allTags.map(tag => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant={activeFilters.includes(tag) ? 'filled' : 'outlined'}
              color={activeFilters.includes(tag) ? 'primary' : 'default'}
              onClick={() => toggleFilter(tag)}
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
          ))}
          {activeFilters.length > 0 && (
            <Chip
              label={t('clearFilter')}
              size="small"
              variant="outlined"
              onClick={() => setActiveFilters([])}
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
          )}
        </Box>
      )}

      {/* File list */}
      {visibleFiles.length === 0 ? (
        <Typography
          variant="body2"
          color="text.disabled"
          sx={{ mt: 1.25, fontStyle: 'italic', fontSize: '0.82rem' }}
        >
          {files.length === 0 ? t('noFilesMsg') : t('noFilesMatchFilter')}
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1.25 }}>
          {visibleFiles.map(file => {
            const canEdit = isAdmin || file.authorEmail === user.email

            return (
              <Box
                key={file.id}
                sx={{
                  border: '1px solid #e6ebf0',
                  borderRadius: 2,
                  px: 1.25,
                  py: 1,
                  bgcolor: '#fafbfd',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InsertDriveFileIcon sx={{ color: '#5f6b7a', flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {file.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {formatBytes(file.size)} · {timeLabel(file.uploadedAt)}
                    </Typography>
                  </Box>
                  {canEdit && editingFileId !== file.id && (
                    <Tooltip title={t('editTagsTooltip')}>
                      <IconButton size="small" data-testid="edit-tags-btn" onClick={() => startEditTags(file)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={t('downloadTooltip')}>
                    <IconButton size="small" onClick={() => downloadFile(file)}>
                      <DownloadIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  {canEdit && (
                    <Tooltip title={t('deleteTooltip')}>
                      <IconButton size="small" color="error" onClick={() => removeFile(file)}>
                        <DeleteIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {/* Inline tag editor or tag chips */}
                {editingFileId === file.id ? (
                  <Box sx={{ mt: 1 }}>
                    <TagInput tags={editTags} onChange={setEditTags} suggestions={suggestions} />
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, justifyContent: 'flex-end' }}>
                      <Tooltip title={t('cancel')}>
                        <IconButton size="small" onClick={() => setEditingFileId(null)}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('save')}>
                        <IconButton size="small" color="primary" onClick={() => saveEditTags(file.id)}>
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                ) : (
                  file.tags?.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {file.tags.map(tag => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.68rem', height: 20 }}
                        />
                      ))}
                    </Box>
                  )
                )}
              </Box>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}

import { useState, useEffect, useRef } from 'react'
import {
  Box, Typography, TextField, IconButton,
  Avatar, Stack, Tooltip,
} from '@mui/material'
import SendIcon   from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon   from '@mui/icons-material/Edit'
import CheckIcon  from '@mui/icons-material/Check'
import CloseIcon  from '@mui/icons-material/Close'
import {
  collection, query, where,
  onSnapshot, addDoc, deleteDoc, updateDoc,
  doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

function timeAgo(ts) {
  if (!ts?.toMillis) return ''
  const s = Math.floor((Date.now() - ts.toMillis()) / 1000)
  if (s < 60)    return 'ahora'
  if (s < 3600)  return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

function initials(name, email) {
  if (name) return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return email?.[0]?.toUpperCase() ?? '?'
}

function authorColor(str = '') {
  const palette = ['#1976D2', '#388E3C', '#D32F2F', '#7B1FA2', '#F57C00', '#0097A7', '#5D4037', '#455A64']
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

export default function DayNotes({ tripId, gatewayTripId, dayNumber, user, isAdmin }) {
  const [notes, setNotes]       = useState([])
  const [text, setText]         = useState('')
  const [editingId, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const inputRef                = useRef()

  useEffect(() => {
    if (!gatewayTripId || !dayNumber) return
    const q = query(
      collection(db, 'trips', gatewayTripId, 'notes'),
      where('tripId', '==', tripId),
    )
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.dayNumber === dayNumber)
      docs.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      setNotes(docs)
    })
    return unsub
  }, [gatewayTripId, tripId, dayNumber])

  async function addNote() {
    const t = text.trim()
    if (!t) return
    await addDoc(collection(db, 'trips', gatewayTripId, 'notes'), {
      tripId,
      dayNumber,
      text:        t,
      authorEmail: user.email,
      authorName:  user.displayName ?? user.email,
      createdAt:   serverTimestamp(),
    })
    setText('')
    inputRef.current?.focus()
  }

  async function removeNote(id) {
    await deleteDoc(doc(db, 'trips', gatewayTripId, 'notes', id))
  }

  async function saveEdit(id) {
    const t = editText.trim()
    if (t) await updateDoc(doc(db, 'trips', gatewayTripId, 'notes', id), {
      text: t, updatedAt: serverTimestamp(),
    })
    setEditing(null)
  }

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed #e8e8e8' }}>
      <Typography variant="overline" color="text.secondary"
        sx={{ fontSize: '0.68rem', letterSpacing: 1 }}>
        Notas del grupo
      </Typography>

      {notes.length === 0 && (
        <Typography variant="body2" color="text.disabled"
          sx={{ mt: 0.5, mb: 1.5, fontStyle: 'italic', fontSize: '0.82rem' }}>
          Sin notas aún — sé el primero.
        </Typography>
      )}

      <Stack spacing={1.25} sx={{ mt: notes.length ? 1 : 0, mb: 1.5 }}>
        {notes.map(note => {
          const isOwn    = note.authorEmail === user.email
          const canEdit  = isOwn
          const canDelete = isOwn || isAdmin

          return (
            <Box
              key={note.id}
              className="note-row"
              sx={{
                display: 'flex', gap: 1, alignItems: 'flex-start',
                '& .note-actions': { opacity: 0, transition: 'opacity 0.15s' },
                '&:hover .note-actions': { opacity: 1 },
              }}
            >
              <Avatar
                src={isOwn ? user.photoURL : undefined}
                sx={{
                  width: 28, height: 28, fontSize: '0.7rem', flexShrink: 0, mt: 0.25,
                  bgcolor: authorColor(note.authorEmail),
                }}
              >
                {initials(note.authorName, note.authorEmail)}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.2, flexWrap: 'wrap' }}>
                  <Typography variant="caption" fontWeight={700} noWrap sx={{ maxWidth: 160 }}>
                    {isOwn ? 'Tú' : (note.authorName ?? note.authorEmail)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">·</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {timeAgo(note.createdAt)}
                  </Typography>
                  {note.updatedAt && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      (editado)
                    </Typography>
                  )}
                </Box>

                {editingId === note.id ? (
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <TextField
                      size="small" variant="standard" fullWidth multiline
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(note.id) }
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      autoFocus
                    />
                    <Tooltip title="Guardar">
                      <IconButton size="small" color="primary" onClick={() => saveEdit(note.id)}>
                        <CheckIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancelar">
                      <IconButton size="small" onClick={() => setEditing(null)}>
                        <CloseIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ flex: 1, lineHeight: 1.5, wordBreak: 'break-word', fontSize: '0.875rem' }}>
                      {note.text}
                    </Typography>
                    <Box className="note-actions" sx={{ display: 'flex', flexShrink: 0 }}>
                      {canEdit && (
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => { setEditing(note.id); setEditText(note.text) }}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Eliminar">
                          <IconButton size="small" color="error" onClick={() => removeNote(note.id)}>
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          )
        })}
      </Stack>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          inputRef={inputRef}
          size="small" variant="outlined" fullWidth multiline maxRows={4}
          placeholder="Escribe una nota..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() }
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.875rem' } }}
        />
        <Tooltip title="Enviar (Enter)">
          <span>
            <IconButton
              onClick={addNote}
              disabled={!text.trim()}
              color="primary"
              sx={{ mb: 0.25, p: 0.875 }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}

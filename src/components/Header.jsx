import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useRef } from 'react'
import { Box, Typography, Chip, Button, Tooltip, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material'
import ArrowBackIcon    from '@mui/icons-material/ArrowBack'
import EditIcon         from '@mui/icons-material/Edit'
import EditOffIcon      from '@mui/icons-material/EditOff'
import UploadFileIcon   from '@mui/icons-material/UploadFile'
import DataObjectIcon   from '@mui/icons-material/DataObject'
import FlightIcon       from '@mui/icons-material/Flight'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import LocationOnIcon   from '@mui/icons-material/LocationOn'
import PeopleIcon       from '@mui/icons-material/People'
import HistoryIcon      from '@mui/icons-material/History'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import LogoutIcon       from '@mui/icons-material/Logout'
import MenuIcon         from '@mui/icons-material/Menu'
import AdminPanel       from './AdminPanel'

export default function Header({ title, subtitle, stats, user, isAdmin, editMode, onToggleEdit, onUploadJson, onOpenJsonEditor, onOpenVersionHistory, onDownloadPdf, pdfLoading, onBack }) {
  const [adminOpen, setAdminOpen]   = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const fileInputRef = useRef()

  const statIcons = [
    <CalendarMonthIcon key="cal" sx={{ fontSize: 16 }} />,
    <LocationOnIcon    key="loc" sx={{ fontSize: 16 }} />,
    <LocationOnIcon    key="loc2" sx={{ fontSize: 16 }} />,
    <FlightIcon        key="fly" sx={{ fontSize: 16 }} />,
  ]

  function handleUpload(file) {
    onUploadJson(file)
    setMenuAnchor(null)
  }

  // Actions list — used for both desktop buttons and mobile menu
  const actions = [
    editMode && onUploadJson && {
      key: 'upload',
      icon: <UploadFileIcon fontSize="small" />,
      label: 'Subir JSON',
      onClick: () => { fileInputRef.current.click(); setMenuAnchor(null) },
    },
    editMode && onOpenJsonEditor && {
      key: 'json',
      icon: <DataObjectIcon fontSize="small" />,
      label: 'Editar JSON',
      onClick: () => { onOpenJsonEditor(); setMenuAnchor(null) },
    },
    onToggleEdit && {
      key: 'edit',
      icon: editMode ? <EditOffIcon fontSize="small" /> : <EditIcon fontSize="small" />,
      label: editMode ? 'Salir de edición' : 'Editar',
      onClick: () => { onToggleEdit(); setMenuAnchor(null) },
      highlight: editMode,
    },
    onDownloadPdf && {
      key: 'pdf',
      icon: <PictureAsPdfIcon fontSize="small" />,
      label: pdfLoading ? 'Generando…' : 'PDF',
      onClick: () => { onDownloadPdf(); setMenuAnchor(null) },
      disabled: pdfLoading,
    },
    isAdmin && onOpenVersionHistory && {
      key: 'versions',
      icon: <HistoryIcon fontSize="small" />,
      label: 'Versiones',
      onClick: () => { onOpenVersionHistory(); setMenuAnchor(null) },
    },
    isAdmin && {
      key: 'admin',
      icon: <PeopleIcon fontSize="small" />,
      label: 'Accesos',
      onClick: () => { setAdminOpen(true); setMenuAnchor(null) },
    },
    {
      key: 'logout',
      icon: <LogoutIcon fontSize="small" />,
      label: 'Salir',
      onClick: () => signOut(auth),
      dividerBefore: true,
    },
  ].filter(Boolean)

  return (
    <>
      <Box
        sx={{
          background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
          color: '#fff',
          py: { xs: 6, md: 9 },
          px: 3,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Rainbow top bar */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, #2E7D32, #AD1457, #0277BD)',
        }} />

        {/* Back button — top left */}
        {onBack && (
          <Box sx={{ position: 'absolute', top: 12, left: 12 }}>
            <Button
              size="small"
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              onClick={onBack}
              sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', textTransform: 'none', '&:hover': { color: '#fff' } }}
            >
              Mis Viajes
            </Button>
          </Box>
        )}

        {/* User controls — top right */}
        {user && (
          <Box sx={{ position: 'absolute', top: 12, right: 14, display: 'flex', alignItems: 'center', gap: 1 }}>

            {/* Hidden file input */}
            {onUploadJson && (
              <input ref={fileInputRef} type="file" accept=".json,application/json" hidden
                onChange={e => { handleUpload(e.target.files[0]); e.target.value = '' }} />
            )}

            {/* ── Desktop: individual buttons (hidden on xs) ── */}
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.75 }}>
              {actions.map(a => (
                <Button
                  key={a.key}
                  size="small"
                  variant="outlined"
                  startIcon={a.icon}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  sx={{
                    borderColor: a.highlight ? '#81c784' : 'rgba(255,255,255,0.45)',
                    color: a.highlight ? '#81c784' : '#fff',
                    fontSize: '0.8rem',
                    textTransform: 'none',
                    px: 1.5,
                    py: 0.5,
                    '&:hover': {
                      borderColor: '#fff',
                      bgcolor: 'rgba(255,255,255,0.12)',
                    },
                    '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.3)' },
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </Box>

            {/* ── Mobile: hamburger button (hidden on sm+) ── */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
              <IconButton
                onClick={e => setMenuAnchor(e.currentTarget)}
                sx={{ color: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                <MenuIcon />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                PaperProps={{ sx: { minWidth: 200, mt: 1 } }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                {actions.map(a => [
                  a.dividerBefore && <Divider key={`div-${a.key}`} />,
                  <MenuItem
                    key={a.key}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    sx={a.highlight ? { color: 'success.main' } : {}}
                  >
                    <ListItemIcon sx={a.highlight ? { color: 'success.main' } : {}}>{a.icon}</ListItemIcon>
                    <ListItemText>{a.label}</ListItemText>
                  </MenuItem>,
                ])}
              </Menu>
            </Box>

          </Box>
        )}

        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 700, letterSpacing: '-0.5px', mb: 1,
            fontSize: { xs: '2rem', md: '2.8rem' },
          }}
        >
          🍁 {title}
        </Typography>

        <Typography
          variant="h6"
          sx={{
            color: 'rgba(255,255,255,0.7)', fontWeight: 300,
            letterSpacing: 2, textTransform: 'uppercase',
            fontSize: { xs: '0.85rem', md: '1rem' }, mb: 4,
          }}
        >
          {subtitle}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          {stats.map((stat, i) => (
            <Chip
              key={i}
              icon={statIcons[i]}
              label={stat}
              sx={{
                bgcolor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                fontWeight: 500,
                '& .MuiChip-icon': { color: 'rgba(255,255,255,0.75)' },
              }}
            />
          ))}
        </Box>
      </Box>

      {isAdmin && (
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          currentUserEmail={user?.email}
        />
      )}
    </>
  )
}

import { useState, useRef } from 'react'
import { signOutWithCleanup } from '../firebase'
import { Box, Typography, Chip, Button, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material'
import ArrowBackIcon    from '@mui/icons-material/ArrowBack'
import AttachFileIcon   from '@mui/icons-material/AttachFile'
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
import PersonIcon       from '@mui/icons-material/Person'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import AdminPanel       from './AdminPanel'
import UserProfileDialog from './UserProfileDialog'
import { useT, useLang, useChangeLang } from '../i18n'

export default function Header({ title, subtitle, stats, user, isAdmin, author, editMode, onToggleEdit, onUploadJson, onOpenJsonEditor, onOpenVersionHistory, onDownloadPdf, pdfLoading, onOpenFiles, onBack }) {
  const t          = useT()
  const lang       = useLang()
  const changeLang = useChangeLang()
  const [adminOpen, setAdminOpen]     = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [menuAnchor, setMenuAnchor]   = useState(null)
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

  const actions = [
    editMode && onUploadJson && {
      key: 'upload',
      icon: <UploadFileIcon fontSize="small" />,
      label: t('uploadJson'),
      onClick: () => { fileInputRef.current.click(); setMenuAnchor(null) },
    },
    editMode && onOpenJsonEditor && {
      key: 'json',
      icon: <DataObjectIcon fontSize="small" />,
      label: t('editJson'),
      onClick: () => { onOpenJsonEditor(); setMenuAnchor(null) },
    },
    onToggleEdit && {
      key: 'edit',
      icon: editMode ? <EditOffIcon fontSize="small" /> : <EditIcon fontSize="small" />,
      label: editMode ? t('exitEdit') : t('edit'),
      onClick: () => { onToggleEdit(); setMenuAnchor(null) },
      highlight: editMode,
    },
    onOpenFiles && {
      key: 'files',
      icon: <AttachFileIcon fontSize="small" />,
      label: t('allFilesBtn'),
      onClick: () => { onOpenFiles(); setMenuAnchor(null) },
    },
    onDownloadPdf && {
      key: 'pdf',
      icon: <PictureAsPdfIcon fontSize="small" />,
      label: pdfLoading ? t('generatingPdf') : t('pdf'),
      onClick: () => { onDownloadPdf(); setMenuAnchor(null) },
      disabled: pdfLoading,
    },
    onOpenVersionHistory && {
      key: 'versions',
      icon: <HistoryIcon fontSize="small" />,
      label: t('versions'),
      onClick: () => { onOpenVersionHistory(); setMenuAnchor(null) },
    },
    isAdmin && {
      key: 'admin',
      icon: <PeopleIcon fontSize="small" />,
      label: t('access'),
      onClick: () => { setAdminOpen(true); setMenuAnchor(null) },
    },
    user && {
      key: 'profile',
      icon: <AccountCircleIcon fontSize="small" />,
      label: t('profile'),
      onClick: () => { setProfileOpen(true); setMenuAnchor(null) },
      testid: 'header-profile-btn',
    },
    {
      key: 'logout',
      icon: <LogoutIcon fontSize="small" />,
      label: t('logout'),
      onClick: () => signOutWithCleanup(),
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
          <Box sx={{ position: 'absolute', top: 10, left: 12 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={onBack}
              sx={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: { xs: '0.95rem', sm: '1rem' },
                fontWeight: 500,
                textTransform: 'none',
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
              }}
            >
              {t('myTrips')}
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

            {/* Language toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', borderRadius: 1, border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              {['en', 'es'].map(l => (
                <Button key={l} size="small" onClick={() => changeLang(l)} aria-pressed={lang === l} sx={{
                  minWidth: 0, px: 1.2, py: 0.3, borderRadius: 0,
                  fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                  color: lang === l ? '#fff' : 'rgba(255,255,255,0.35)',
                  bgcolor: lang === l ? 'rgba(255,255,255,0.12)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', color: '#fff' },
                }}>{l}</Button>
              ))}
            </Box>

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
                  data-testid={a.testid}
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
                    data-testid={a.testid}
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

        {author && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Chip
              icon={<PersonIcon sx={{ fontSize: '14px !important' }} />}
              label={author}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.15)',
                fontSize: '0.72rem',
                '& .MuiChip-icon': { color: 'rgba(255,255,255,0.4)' },
              }}
            />
          </Box>
        )}
      </Box>

      {isAdmin && (
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          currentUserEmail={user?.email}
        />
      )}

      {user && (
        <UserProfileDialog
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          userEmail={user.email}
        />
      )}
    </>
  )
}

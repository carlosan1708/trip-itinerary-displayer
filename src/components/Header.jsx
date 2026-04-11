import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { Box, Typography, Chip, Button, Tooltip } from '@mui/material'
import FlightIcon from '@mui/icons-material/Flight'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import PeopleIcon from '@mui/icons-material/People'
import LogoutIcon from '@mui/icons-material/Logout'
import AdminPanel from './AdminPanel'

export default function Header({ title, subtitle, stats, user, isAdmin }) {
  const [adminOpen, setAdminOpen] = useState(false)

  const statIcons = [
    <CalendarMonthIcon key="cal" sx={{ fontSize: 16 }} />,
    <LocationOnIcon   key="loc" sx={{ fontSize: 16 }} />,
    <LocationOnIcon   key="loc2" sx={{ fontSize: 16 }} />,
    <FlightIcon       key="fly" sx={{ fontSize: 16 }} />,
  ]

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

        {/* User controls — top right */}
        {user && (
          <Box sx={{
            position: 'absolute', top: 12, right: 16,
            display: 'flex', alignItems: 'center', gap: 1,
          }}>
            {isAdmin && (
              <Tooltip title="Gestionar accesos">
                <Button
                  size="small"
                  startIcon={<PeopleIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setAdminOpen(true)}
                  sx={{
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    '&:hover': { color: '#fff' },
                  }}
                >
                  Accesos
                </Button>
              </Tooltip>
            )}
            <Tooltip title={`Cerrar sesión (${user.email})`}>
              <Button
                size="small"
                startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
                onClick={() => signOut(auth)}
                sx={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  minWidth: 0,
                  '&:hover': { color: '#fff' },
                }}
              >
                Salir
              </Button>
            </Tooltip>
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

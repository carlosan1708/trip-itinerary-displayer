import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#B71C1C',
    },
    background: {
      default: '#F5F2EC',
      paper: '#FFFFFF',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Roboto", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 500 },
  },
  components: {
    MuiAccordion: {
      styleOverrides: {
        root: {
          '&:before': { display: 'none' },
        },
      },
    },
  },
})

export default theme

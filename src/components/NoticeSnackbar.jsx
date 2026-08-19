import { Snackbar, Alert } from '@mui/material'

/**
 * Non-blocking in-app notice — replaces native window.alert().
 * `message` is truthy to show; pass null/'' to hide.
 */
export default function NoticeSnackbar({ message, onClose, severity = 'info', autoHideDuration = 6000 }) {
  return (
    <Snackbar
      open={!!message}
      onClose={onClose}
      autoHideDuration={autoHideDuration}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        data-testid="notice-snackbar"
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}

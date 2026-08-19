import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material'

/**
 * Reusable in-app confirmation dialog — replaces native window.confirm().
 * Danger actions (delete) get a red confirm button.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  danger = false,
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="confirm-dialog">
      {title && <DialogTitle>{title}</DialogTitle>}
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} data-testid="confirm-cancel" sx={{ textTransform: 'none' }}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={danger ? 'error' : 'primary'}
          data-testid="confirm-accept"
          sx={{ textTransform: 'none' }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

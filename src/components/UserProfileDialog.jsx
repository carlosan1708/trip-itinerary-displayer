import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, CircularProgress, Divider, Stack,
} from '@mui/material'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useT } from '../i18n'

const EMPTY = {
  passportNumber: '', passportExpiry: '', insurancePolicy: '',
  bloodType: '', allergies: '',
  emergencyName: '', emergencyPhone: '', emergencyRelation: '',
  homeCurrency: '', homeTimezone: '',
}

export default function UserProfileDialog({ open, onClose, userEmail }) {
  const t = useT()
  const [fields, setFields]   = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!open || !userEmail) return
    let cancelled = false
    setLoading(true)
    getDoc(doc(db, 'users', userEmail)).then(snap => {
      if (cancelled) return
      const data = snap.exists() ? snap.data() : {}
      const ec = data.emergencyContact || {}
      setFields({
        passportNumber:    data.passportNumber    ?? '',
        passportExpiry:    data.passportExpiry    ?? '',
        insurancePolicy:   data.insurancePolicy   ?? '',
        bloodType:         data.bloodType         ?? '',
        allergies:         Array.isArray(data.allergies) ? data.allergies.join(', ') : '',
        emergencyName:     ec.name     ?? '',
        emergencyPhone:    ec.phone    ?? '',
        emergencyRelation: ec.relation ?? '',
        homeCurrency:      data.homeCurrency      ?? '',
        homeTimezone:      data.homeTimezone      ?? '',
      })
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, userEmail])

  function update(key, value) {
    setFields(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!userEmail) return
    setSaving(true)
    const allergies = fields.allergies
      .split(',').map(s => s.trim()).filter(Boolean)
    const payload = {
      passportNumber:  fields.passportNumber.trim(),
      passportExpiry:  fields.passportExpiry.trim(),
      insurancePolicy: fields.insurancePolicy.trim(),
      bloodType:       fields.bloodType.trim(),
      allergies,
      emergencyContact: {
        name:     fields.emergencyName.trim(),
        phone:    fields.emergencyPhone.trim(),
        relation: fields.emergencyRelation.trim(),
      },
      homeCurrency: fields.homeCurrency.trim().toUpperCase(),
      homeTimezone: fields.homeTimezone.trim(),
    }
    try {
      await setDoc(doc(db, 'users', userEmail), payload, { merge: true })
      onClose()
    } catch (err) {
      console.warn('[profile] save failed:', err.message)
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {t('profileTitle')}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          {t('profilePrivacyNote')}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={2.5}>
            <Section label={t('profileIdentity')}>
              <TextField fullWidth size="small" label={t('profilePassportNumber')}
                value={fields.passportNumber}
                onChange={e => update('passportNumber', e.target.value)}
                inputProps={{ 'data-testid': 'profile-passport-number' }} />
              <TextField fullWidth size="small" label={t('profilePassportExpiry')}
                placeholder="YYYY-MM-DD"
                value={fields.passportExpiry}
                onChange={e => update('passportExpiry', e.target.value)}
                inputProps={{ 'data-testid': 'profile-passport-expiry' }} />
              <TextField fullWidth size="small" label={t('profileInsurance')}
                value={fields.insurancePolicy}
                onChange={e => update('insurancePolicy', e.target.value)} />
            </Section>

            <Divider />

            <Section label={t('profileHealth')}>
              <TextField fullWidth size="small" label={t('profileBloodType')}
                value={fields.bloodType}
                onChange={e => update('bloodType', e.target.value)} />
              <TextField fullWidth size="small" label={t('profileAllergies')}
                value={fields.allergies}
                onChange={e => update('allergies', e.target.value)} />
            </Section>

            <Divider />

            <Section label={t('profileEmergency')}>
              <TextField fullWidth size="small" label={t('profileEmergencyName')}
                value={fields.emergencyName}
                onChange={e => update('emergencyName', e.target.value)} />
              <TextField fullWidth size="small" label={t('profileEmergencyPhone')}
                value={fields.emergencyPhone}
                onChange={e => update('emergencyPhone', e.target.value)} />
              <TextField fullWidth size="small" label={t('profileEmergencyRelation')}
                value={fields.emergencyRelation}
                onChange={e => update('emergencyRelation', e.target.value)} />
            </Section>

            <Divider />

            <Section label={t('profilePreferences')}>
              <TextField fullWidth size="small" label={t('profileHomeCurrency')}
                value={fields.homeCurrency}
                onChange={e => update('homeCurrency', e.target.value)}
                inputProps={{ 'data-testid': 'profile-home-currency', maxLength: 3 }} />
              <TextField fullWidth size="small" label={t('profileHomeTimezone')}
                value={fields.homeTimezone}
                onChange={e => update('homeTimezone', e.target.value)} />
            </Section>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          data-testid="profile-save"
        >
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Section({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary"
        sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1, display: 'block' }}>
        {label}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  )
}

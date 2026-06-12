import { useState } from 'react'
import { Box, Typography, Paper, Stack, TextField, Button, Divider } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'

import { useT } from '../i18n'

export default function EmptyDashboard({ onBuildWithAi, onPasteJson }) {
  const t = useT()
  const [description, setDescription] = useState('')

  function handleSubmit() {
    const text = description.trim()
    if (!text) return
    onBuildWithAi?.(text)
  }

  const ctas = [
    {
      key: 'ai',
      icon: <AutoAwesomeIcon sx={{ fontSize: 28 }} />,
      title: t('emptyCtaAiTitle'),
      desc: t('emptyCtaAiDesc'),
      onClick: () => onBuildWithAi?.(),
      gradient: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
      testid: 'empty-cta-ai',
    },
    {
      key: 'paste',
      icon: <ContentPasteIcon sx={{ fontSize: 28 }} />,
      title: t('emptyCtaPasteTitle'),
      desc: t('emptyCtaPasteDesc'),
      onClick: onPasteJson,
      gradient: 'linear-gradient(135deg, #2E7D32 0%, #558B2F 100%)',
      testid: 'empty-cta-paste',
    },
  ]

  return (
    <Box data-testid="empty-dashboard" sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, py: 5 }}>
      <Paper elevation={0} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.75, textAlign: 'center' }}>
          {t('emptyHeading')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
          {t('emptyPitch')}
        </Typography>

        <Stack spacing={1.5}>
          <TextField
            multiline
            minRows={3}
            maxRows={6}
            fullWidth
            label={t('emptyDescribeLabel')}
            placeholder={t('emptyDescribePlaceholder')}
            value={description}
            onChange={e => setDescription(e.target.value)}
            inputProps={{ 'data-testid': 'empty-describe-input' }}
          />
          <Button
            variant="contained"
            size="large"
            disabled={!description.trim()}
            onClick={handleSubmit}
            startIcon={<AutoAwesomeIcon />}
            data-testid="empty-describe-submit"
            sx={{
              alignSelf: 'flex-end',
              background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #a01818 0%, #6a1b9a 100%)' },
            }}
          >
            {t('emptyDescribeSubmit')}
          </Button>
        </Stack>

        <Divider sx={{ my: 3 }}>
          <Typography variant="caption" color="text.secondary">
            {t('emptyOrSeparator')}
          </Typography>
        </Divider>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: 'stretch' }}
        >
          {ctas.map(cta => (
            <Box
              key={cta.key}
              data-testid={cta.testid}
              onClick={cta.onClick}
              sx={{
                flex: 1,
                cursor: 'pointer',
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.18s',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                '&:hover': {
                  borderColor: 'primary.main',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                },
              }}
            >
              <Box
                sx={{
                  width: 48, height: 48, borderRadius: 2,
                  background: cta.gradient,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                }}
              >
                {cta.icon}
              </Box>
              <Typography variant="subtitle2" fontWeight={700}>{cta.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {cta.desc}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  )
}

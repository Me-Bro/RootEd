import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import PdfPreviewDialog from '../../components/report-cards/PdfPreviewDialog.jsx';
import { apiError } from '../../utils/studyCenter.js';
import {
  REPORT_CARD_PRESETS,
  buildPayload,
  checkLogoFile,
  resolveForm,
} from '../../utils/reportCardSettings.js';

// A small drawing of each layout, so the choice is visible before a preview.
function PresetThumb({ preset, accent }) {
  const line = '#9ca3af';
  return (
    <svg viewBox="0 0 60 80" className="h-24 w-[4.5rem] rounded border bg-white" aria-hidden="true">
      {preset === 'classic' && (
        <>
          <rect x="15" y="6" width="30" height="4" fill={accent} />
          <rect x="22" y="12" width="16" height="2" fill={line} />
          <rect x="6" y="22" width="26" height="2" fill="#374151" />
          <rect x="6" y="30" width="48" height="1" fill={accent} />
          {[34, 40, 46, 52].map((y) => (
            <rect key={y} x="6" y={y} width="48" height="2" fill={line} />
          ))}
          <rect x="30" y="60" width="24" height="2" fill="#374151" />
          <rect x="8" y="72" width="16" height="1" fill="#374151" />
          <rect x="36" y="72" width="16" height="1" fill="#374151" />
        </>
      )}
      {preset === 'modern' && (
        <>
          <rect x="0" y="0" width="60" height="15" fill={accent} />
          <rect x="6" y="5" width="28" height="3" fill="#fff" />
          <rect x="5" y="19" width="50" height="8" fill={accent} opacity="0.12" />
          <rect x="5" y="30" width="50" height="4" fill={accent} />
          {[36, 42, 48].map((y, i) => (
            <rect
              key={y}
              x="5"
              y={y}
              width="50"
              height="5"
              fill={accent}
              opacity={i % 2 ? 0.12 : 0}
            />
          ))}
          {[5, 18, 31, 44].map((x) => (
            <rect key={x} x={x} y="56" width="11" height="9" fill={accent} opacity="0.12" />
          ))}
          <rect x="8" y="73" width="16" height="1" fill="#374151" />
          <rect x="36" y="73" width="16" height="1" fill="#374151" />
        </>
      )}
      {preset === 'compact' && (
        <>
          <rect x="6" y="6" width="26" height="3" fill="#111827" />
          <rect x="6" y="11" width="18" height="2" fill={line} />
          <rect x="6" y="16" width="48" height="1.5" fill={accent} />
          <rect x="6" y="20" width="22" height="2" fill="#374151" />
          {[26, 30, 34, 38, 42, 46, 50, 54].map((y) => (
            <rect key={y} x="6" y={y} width="48" height="1.5" fill={line} />
          ))}
          <rect x="6" y="60" width="40" height="2" fill="#374151" />
          <rect x="8" y="72" width="16" height="1" fill="#374151" />
          <rect x="36" y="72" width="16" height="1" fill="#374151" />
        </>
      )}
    </svg>
  );
}

// How this school's report cards look: a layout, a color, a logo and the wording
// printed on every card. The API fills in the defaults, so nothing here is saved
// until the administrator presses Save.
export default function ReportCardSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Edits layered over the server's answer (see CentreSettingsPage): a refetch must
  // neither revert what was typed nor be hidden by it.
  const [edits, setEdits] = useState({});

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });

  const savedConfig = settings.data?.settings?.reportCard;
  const hasLogo = Boolean(savedConfig?.logoKey);
  const form = resolveForm(savedConfig, edits);
  const change = (patch) => {
    setSaved(false);
    setEdits((e) => ({ ...e, ...patch }));
  };
  const setSignatory = (i, value) =>
    change({ signatories: form.signatories.map((s, j) => (j === i ? value : s)) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });

  const save = useMutation({
    mutationFn: () => {
      const built = buildPayload(form);
      if (!built.ok) throw new Error('signatories');
      return api.patch('/tenant/settings', { reportCard: built.payload });
    },
    onSuccess: () => {
      setError('');
      setSaved(true);
      setEdits({});
      refresh();
    },
    onError: (err) => {
      setSaved(false);
      setError(
        err.message === 'signatories'
          ? t('reportCardSettings.signatoriesRequired')
          : apiError(err, t('reportCardSettings.saveFailed'))
      );
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post('/tenant/report-card/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(apiError(err, t('reportCardSettings.logoUploadFailed'))),
  });

  const removeLogo = useMutation({
    mutationFn: () => api.delete('/tenant/report-card/logo'),
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(apiError(err, t('reportCardSettings.logoRemoveFailed'))),
  });

  const onPickLogo = (file) => {
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem === 'type') return setError(t('reportCardSettings.logoBadType'));
    if (problem === 'size') return setError(t('reportCardSettings.logoTooBig'));
    uploadLogo.mutate(file);
  };

  // The PDF is drawn inside the page (PdfPreviewDialog) rather than opened in a
  // tab: the Android app cannot open a blob: PDF link, and phones often have no
  // PDF viewer.
  const [previewData, setPreviewData] = useState(null);
  const preview = useMutation({
    mutationFn: async () => {
      const built = buildPayload(form);
      if (!built.ok) throw new Error('signatories');
      const res = await api.post(
        '/academic/report-card/preview',
        { config: built.payload },
        { responseType: 'arraybuffer' }
      );
      return res.data;
    },
    onSuccess: (data) => {
      setError('');
      setPreviewData(data);
    },
    onError: (err) => {
      setError(
        err.message === 'signatories'
          ? t('reportCardSettings.signatoriesRequired')
          : t('reportCardSettings.previewFailed')
      );
    },
  });

  const busy = save.isPending || settings.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('reportCardSettings.title')}
        description={t('reportCardSettings.description')}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('reportCardSettings.saved')}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-6 pt-4">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{t('reportCardSettings.layout')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {REPORT_CARD_PRESETS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                    form.preset === value ? 'border-primary bg-muted/50' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-card-preset"
                    value={value}
                    checked={form.preset === value}
                    onChange={() => change({ preset: value })}
                    className="mt-1"
                  />
                  <PresetThumb preset={value} accent={form.accentColor} />
                  <span>
                    {t(`reportCardSettings.preset_${value}`)}
                    <span className="block text-xs text-muted-foreground">
                      {t(`reportCardSettings.presetHint_${value}`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="report-card-accent" className="text-sm font-medium">
              {t('reportCardSettings.accent')}
            </label>
            <input
              id="report-card-accent"
              type="color"
              value={form.accentColor}
              onChange={(e) => change({ accentColor: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded border bg-transparent p-1"
            />
            <span className="font-mono text-sm text-muted-foreground">{form.accentColor}</span>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('reportCardSettings.logo')}</legend>
            <p className="text-xs text-muted-foreground">
              {hasLogo ? t('reportCardSettings.logoSet') : t('reportCardSettings.logoNone')}{' '}
              {t('reportCardSettings.logoHint')}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              aria-label={t('reportCardSettings.logo')}
              onChange={(e) => {
                onPickLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={uploadLogo.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadLogo.isPending
                  ? t('reportCardSettings.logoUploading')
                  : hasLogo
                    ? t('reportCardSettings.logoReplace')
                    : t('reportCardSettings.logoUpload')}
              </Button>
              {hasLogo && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={removeLogo.isPending}
                  onClick={() => removeLogo.mutate()}
                >
                  {t('reportCardSettings.logoRemove')}
                </Button>
              )}
            </div>
          </fieldset>

          <div className="grid max-w-2xl grid-cols-1 gap-4">
            <Input
              id="report-card-school-name"
              label={t('reportCardSettings.schoolName')}
              value={form.schoolName}
              placeholder={settings.data?.name ?? ''}
              maxLength={80}
              onChange={(e) => change({ schoolName: e.target.value })}
            />
            <Input
              id="report-card-subtitle"
              label={t('reportCardSettings.subtitle')}
              value={form.subtitle}
              maxLength={120}
              onChange={(e) => change({ subtitle: e.target.value })}
            />
            <Input
              id="report-card-footer"
              label={t('reportCardSettings.footerText')}
              value={form.footerText}
              maxLength={200}
              onChange={(e) => change({ footerText: e.target.value })}
            />
            <Input
              id="report-card-legend"
              label={t('reportCardSettings.legend')}
              value={form.gradingLegend}
              placeholder={t('reportCardSettings.legendPlaceholder')}
              maxLength={160}
              onChange={(e) => change({ gradingLegend: e.target.value })}
            />
          </div>

          <fieldset className="flex max-w-md flex-col gap-3">
            <legend className="text-sm font-medium">{t('reportCardSettings.signatories')}</legend>
            {form.signatories.map((value, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    id={`report-card-signatory-${i}`}
                    label={t('reportCardSettings.signatoryN', { n: i + 1 })}
                    value={value}
                    maxLength={40}
                    onChange={(e) => setSignatory(i, e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={form.signatories.length <= 1}
                  aria-label={t('reportCardSettings.removeSignatory', { n: i + 1 })}
                  onClick={() =>
                    change({ signatories: form.signatories.filter((_, j) => j !== i) })
                  }
                >
                  {t('reportCardSettings.remove')}
                </Button>
              </div>
            ))}
            {form.signatories.length < 3 && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => change({ signatories: [...form.signatories, ''] })}
                >
                  {t('reportCardSettings.addSignatory')}
                </Button>
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('reportCardSettings.show')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.showRank}
                onChange={(e) => change({ showRank: e.target.checked })}
              />
              {t('reportCardSettings.showRank')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.showAttendance}
                onChange={(e) => change({ showAttendance: e.target.checked })}
              />
              {t('reportCardSettings.showAttendance')}
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => save.mutate()}>
              {save.isPending ? t('auth.saving') : t('common.save')}
            </Button>
            <Button
              variant="outline"
              disabled={preview.isPending || settings.isLoading}
              onClick={() => preview.mutate()}
            >
              {preview.isPending
                ? t('reportCardSettings.previewing')
                : t('reportCardSettings.preview')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PdfPreviewDialog
        data={previewData}
        title={t('reportCardSettings.previewTitle')}
        onClose={() => setPreviewData(null)}
      />
    </div>
  );
}

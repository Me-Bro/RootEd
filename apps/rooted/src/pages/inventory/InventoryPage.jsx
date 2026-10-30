import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { RecordList, RecordListItem } from '../../components/ui/RecordList.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import AttentionStrip from '../../components/inventory/AttentionStrip.jsx';

const TAB_IDS = ['items', 'movements', 'requisitions', 'lowStock'];

function movementVariant(type) {
  if (type === 'purchase' || type === 'return') return 'success';
  if (type === 'issue') return 'warning';
  if (type === 'scrap') return 'danger';
  return 'default';
}

function AddItemModal({ open, onOpenChange }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [itemType, setItemType] = useState('consumable');
  const [form, setForm] = useState({
    name: '',
    category: '',
    sku: '',
    unitCost: '',
    location: '',
    quantity: '',
    reorderLevel: '',
    assetId: '',
    purchaseDate: '',
    usefulLifeYears: '5',
    depreciationMethod: 'slm',
  });
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        itemType,
        name: form.name,
        category: form.category,
        sku: form.sku || undefined,
        unitCost: Number(form.unitCost) || 0,
        location: form.location,
      };
      if (itemType === 'consumable') {
        payload.quantity = Number(form.quantity) || 0;
        payload.reorderLevel = Number(form.reorderLevel) || 0;
      } else {
        payload.assetId = form.assetId;
        payload.purchaseDate = form.purchaseDate || undefined;
        payload.usefulLifeYears = Number(form.usefulLifeYears) || 5;
        payload.depreciationMethod = form.depreciationMethod;
        payload.currentValue = Number(form.unitCost) || 0;
      }
      return api.post('/inventory/items', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] });
      onOpenChange(false);
      setForm({
        name: '',
        category: '',
        sku: '',
        unitCost: '',
        location: '',
        quantity: '',
        reorderLevel: '',
        assetId: '',
        purchaseDate: '',
        usefulLifeYears: '5',
        depreciationMethod: 'slm',
      });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('inventory.items.createFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('inventory.items.addItemTitle')}</DialogTitle>
        </DialogHeader>
        <form
          id="add-item"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex gap-3">
            {['consumable', 'fixed_asset'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setItemType(type)}
                className={[
                  'flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                  itemType === type
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {type === 'consumable'
                  ? t('inventory.items.consumable')
                  : t('inventory.items.fixedAsset')}
              </button>
            ))}
          </div>
          <Input label={t('common.name')} value={form.name} onChange={update('name')} required />
          <Input
            label={t('inventory.items.categoryLabel')}
            value={form.category}
            onChange={update('category')}
            required
          />
          <Input label={t('inventory.items.skuLabel')} value={form.sku} onChange={update('sku')} />
          <Input
            label={t('inventory.items.unitCostLabel')}
            type="number"
            value={form.unitCost}
            onChange={update('unitCost')}
            min="0"
          />
          <Input
            label={t('inventory.items.locationLabel')}
            value={form.location}
            onChange={update('location')}
          />

          {itemType === 'consumable' && (
            <>
              <Input
                label={t('inventory.items.initialQuantityLabel')}
                type="number"
                value={form.quantity}
                onChange={update('quantity')}
                min="0"
              />
              <Input
                label={t('inventory.items.reorderLevelLabel')}
                type="number"
                value={form.reorderLevel}
                onChange={update('reorderLevel')}
                min="0"
              />
            </>
          )}

          {itemType === 'fixed_asset' && (
            <>
              <Input
                label={t('inventory.items.assetIdLabel')}
                value={form.assetId}
                onChange={update('assetId')}
              />
              <Input
                label={t('inventory.items.purchaseDateLabel')}
                type="date"
                value={form.purchaseDate}
                onChange={update('purchaseDate')}
              />
              <Input
                label={t('inventory.items.usefulLifeLabel')}
                type="number"
                value={form.usefulLifeYears}
                onChange={update('usefulLifeYears')}
                min="1"
              />
              <SelectField
                label={t('inventory.items.depreciationMethodLabel')}
                value={form.depreciationMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, depreciationMethod: v }))}
              >
                <SelectItem value="slm">{t('inventory.items.methodSlm')}</SelectItem>
                <SelectItem value="wdv">{t('inventory.items.methodWdv')}</SelectItem>
              </SelectField>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-item" disabled={mutation.isPending}>
            {mutation.isPending ? t('inventory.items.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueModal({ open, onOpenChange, item }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    entityType: 'staff',
    entityId: '',
    quantity: '1',
    dueDate: '',
  });
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post(`/inventory/items/${item._id}/issue`, {
          quantity: Number(form.quantity),
          issuedTo: { entityType: form.entityType, entityId: form.entityId },
          dueDate: form.dueDate || undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-open-issues-count'] });
      onOpenChange(false);
      setForm({ entityType: 'staff', entityId: '', quantity: '1', dueDate: '' });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('inventory.items.issueFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inventory.items.issueItemTitle', { name: item?.name })}</DialogTitle>
        </DialogHeader>
        <form
          id="issue-item"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <SelectField
            label={t('inventory.items.issuedToLabel')}
            value={form.entityType}
            onValueChange={(v) => setForm((f) => ({ ...f, entityType: v }))}
          >
            <SelectItem value="staff">{t('inventory.items.entityStaff')}</SelectItem>
            <SelectItem value="student">{t('inventory.items.entityStudent')}</SelectItem>
          </SelectField>
          <Input
            label={t('inventory.items.entityIdLabel')}
            value={form.entityId}
            onChange={update('entityId')}
            required
            placeholder={t('inventory.items.entityIdPlaceholder')}
          />
          {item?.itemType === 'consumable' && (
            <Input
              label={t('inventory.items.quantityLabel')}
              type="number"
              value={form.quantity}
              onChange={update('quantity')}
              required
              min="1"
              max={item?.quantity}
            />
          )}
          <Input
            label={t('inventory.items.dueDateOptional')}
            type="date"
            value={form.dueDate}
            onChange={update('dueDate')}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="issue-item" disabled={mutation.isPending}>
            {mutation.isPending ? t('inventory.items.issuing') : t('inventory.items.issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrModal({ open, onOpenChange, item }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-item-qr', item?._id],
    queryFn: () => api.get(`/inventory/items/${item._id}`).then((r) => r.data),
    enabled: Boolean(item?._id),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('inventory.items.qrCodeTitle', { sku: item?.sku })}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {isLoading && <p className="text-muted-foreground">{t('inventory.items.generating')}</p>}
          {data?.qrCodeDataUrl && (
            <img
              src={data.qrCodeDataUrl}
              alt={t('inventory.items.qrCodeAlt', { sku: item?.sku })}
              className="w-48 h-48"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {item?.name} — {item?.sku}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemsTab() {
  const { t } = useTranslation();
  const [itemType, setItemType] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [issueItem, setIssueItem] = useState(null);
  const [qrItem, setQrItem] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items', itemType, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (itemType) params.set('itemType', itemType);
      if (search) params.set('search', search);
      return api.get(`/inventory/items?${params}`).then((r) => r.data);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">{t('inventory.items.allTypes')}</option>
            <option value="consumable">{t('inventory.items.consumable')}</option>
            <option value="fixed_asset">{t('inventory.items.fixedAsset')}</option>
          </select>
          <Input
            placeholder={t('inventory.items.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setShowAdd(true)}>{t('inventory.items.addItemButton')}</Button>
      </div>

      <RecordList
        isLoading={isLoading}
        isEmpty={items.length === 0}
        emptyMessage={t('inventory.items.noneFound')}
      >
        {items.map((item) => (
          <RecordListItem
            key={item._id}
            title={item.name}
            meta={`${item.sku} · ${item.category} · ${
              item.itemType === 'consumable'
                ? t('inventory.items.unitsCount', { count: item.quantity })
                : item.condition || '—'
            }${item.location ? ` · ${item.location}` : ''}`}
            trailing={
              <Badge variant={item.itemType === 'consumable' ? 'default' : 'warning'}>
                {item.itemType === 'consumable'
                  ? t('inventory.items.consumable')
                  : t('inventory.items.fixedAsset')}
              </Badge>
            }
            footer={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setIssueItem(item)}>
                  {t('inventory.items.issue')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQrItem(item)}>
                  {t('inventory.items.qrButton')}
                </Button>
              </div>
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('inventory.items.tableSku'),
          t('common.name'),
          t('inventory.items.tableCategory'),
          t('inventory.items.tableType'),
          t('inventory.items.tableQtyCondition'),
          t('inventory.items.tableLocation'),
          t('common.actions'),
        ]}
        isLoading={isLoading}
        isEmpty={items.length === 0}
        emptyMessage={t('inventory.items.noneFound')}
      >
        {items.map((item) => (
          <TableRow key={item._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{item.sku}</TableCell>
            <TableCell className="px-4 py-3 font-medium">{item.name}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{item.category}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={item.itemType === 'consumable' ? 'default' : 'warning'}>
                {item.itemType === 'consumable'
                  ? t('inventory.items.consumable')
                  : t('inventory.items.fixedAsset')}
              </Badge>
            </TableCell>
            <TableCell className="px-4 py-3">
              {item.itemType === 'consumable'
                ? t('inventory.items.unitsCount', { count: item.quantity })
                : item.condition || '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {item.location || '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setIssueItem(item)}>
                  {t('inventory.items.issue')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQrItem(item)}>
                  {t('inventory.items.qrButton')}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <AddItemModal open={showAdd} onOpenChange={setShowAdd} />
      <IssueModal
        open={Boolean(issueItem)}
        onOpenChange={(v) => !v && setIssueItem(null)}
        item={issueItem}
      />
      <QrModal open={Boolean(qrItem)} onOpenChange={(v) => !v && setQrItem(null)} item={qrItem} />
    </div>
  );
}

function MovementsTab({ type, onTypeChange, openOnly, onOpenOnlyChange }) {
  const { t } = useTranslation();
  const [itemId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const queryClient = useQueryClient();

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['inventory-movements', itemId, type, from, to, openOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (itemId) params.set('itemId', itemId);
      if (type) params.set('type', type);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (openOnly) params.set('returned', 'false');
      return api.get(`/inventory/movements?${params}`).then((r) => r.data);
    },
  });

  const returnMutation = useMutation({
    mutationFn: (movementId) =>
      api.post(`/inventory/movements/${movementId}/return`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-open-issues-count'] });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('inventory.items.allTypes')}</option>
          {['purchase', 'issue', 'return', 'scrap', 'transfer', 'adjustment'].map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => onOpenOnlyChange(e.target.checked)}
          />
          {t('inventory.items.notYetReturned')}
        </label>
      </div>

      <RecordList
        isLoading={isLoading}
        isEmpty={movements.length === 0}
        emptyMessage={t('inventory.items.noMovementsFound')}
      >
        {movements.map((m) => (
          <RecordListItem
            key={m._id}
            title={m.itemId?.name}
            meta={`${t('inventory.items.tableQty')} ${m.quantity} · ${
              m.issuedTo?.entityType ? `${m.issuedTo.entityType}: ${m.issuedTo.entityId}` : '—'
            } · ${new Date(m.createdAt).toLocaleDateString()}${
              m.dueDate ? ` · ${new Date(m.dueDate).toLocaleDateString()}` : ''
            }`}
            trailing={
              <>
                <Badge variant={movementVariant(m.movementType)}>{m.movementType}</Badge>
                {m.returnedAt ? (
                  <Badge variant="success">{t('inventory.items.returnedBadge')}</Badge>
                ) : m.movementType === 'issue' ? (
                  <Badge variant="warning">{t('inventory.items.pendingBadge')}</Badge>
                ) : null}
              </>
            }
            footer={
              m.movementType === 'issue' &&
              !m.returnedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => returnMutation.mutate(m._id)}
                  disabled={returnMutation.isPending}
                >
                  {t('inventory.items.returnButton')}
                </Button>
              )
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('inventory.items.tableItem'),
          t('inventory.items.tableType'),
          t('inventory.items.tableQty'),
          t('inventory.items.tableIssuedTo'),
          t('inventory.items.tableDueDate'),
          t('inventory.items.tableReturned'),
          t('inventory.items.tableDate'),
          t('inventory.items.tableAction'),
        ]}
        isLoading={isLoading}
        isEmpty={movements.length === 0}
        emptyMessage={t('inventory.items.noMovementsFound')}
      >
        {movements.map((m) => (
          <TableRow key={m._id} className="bg-card">
            <TableCell className="px-4 py-3">{m.itemId?.name}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={movementVariant(m.movementType)}>{m.movementType}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3">{m.quantity}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {m.issuedTo?.entityType ? `${m.issuedTo.entityType}: ${m.issuedTo.entityId}` : '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              {m.returnedAt ? (
                <Badge variant="success">{t('inventory.items.returnedBadge')}</Badge>
              ) : m.movementType === 'issue' ? (
                <Badge variant="warning">{t('inventory.items.pendingBadge')}</Badge>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {new Date(m.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="px-4 py-3">
              {m.movementType === 'issue' && !m.returnedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => returnMutation.mutate(m._id)}
                  disabled={returnMutation.isPending}
                >
                  {t('inventory.items.returnButton')}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

function RequisitionsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');

  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['inventory-requisitions', status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      return api.get(`/inventory/requisitions?${params}`).then((r) => r.data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/inventory/requisitions/${id}/approve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-requisitions'] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('inventory.items.reqStatusAll')}</option>
          <option value="pending">{t('inventory.items.reqStatusPending')}</option>
          <option value="approved">{t('inventory.items.reqStatusApproved')}</option>
          <option value="rejected">{t('inventory.items.reqStatusRejected')}</option>
          <option value="ordered">{t('inventory.items.reqStatusOrdered')}</option>
        </select>
      </div>

      <RecordList
        isLoading={isLoading}
        isEmpty={requisitions.length === 0}
        emptyMessage={t('inventory.items.noRequisitionsFound')}
      >
        {requisitions.map((r) => (
          <RecordListItem
            key={r._id}
            title={r.itemId?.name}
            meta={`${r.itemId?.sku ?? '—'} · ${t('inventory.items.tableQtyRequested')} ${
              r.requestedQuantity
            }${r.reason ? ` · ${r.reason}` : ''}`}
            trailing={
              <Badge
                variant={
                  r.status === 'approved'
                    ? 'success'
                    : r.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {r.status}
              </Badge>
            }
            footer={
              r.status === 'pending' && (
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(r._id)}
                  disabled={approveMutation.isPending}
                >
                  {t('inventory.items.approve')}
                </Button>
              )
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('inventory.items.tableItem'),
          t('inventory.items.tableSku'),
          t('inventory.items.tableQtyRequested'),
          t('inventory.items.tableReason'),
          t('common.status'),
          t('inventory.items.tableRequestedBy'),
          t('inventory.items.tableAction'),
        ]}
        isLoading={isLoading}
        isEmpty={requisitions.length === 0}
        emptyMessage={t('inventory.items.noRequisitionsFound')}
      >
        {requisitions.map((r) => (
          <TableRow key={r._id} className="bg-card">
            <TableCell className="px-4 py-3">{r.itemId?.name}</TableCell>
            <TableCell className="px-4 py-3 font-mono text-xs">{r.itemId?.sku}</TableCell>
            <TableCell className="px-4 py-3">{r.requestedQuantity}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{r.reason}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge
                variant={
                  r.status === 'approved'
                    ? 'success'
                    : r.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {r.status}
              </Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {r.requestedBy?.email}
            </TableCell>
            <TableCell className="px-4 py-3">
              {r.status === 'pending' && (
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(r._id)}
                  disabled={approveMutation.isPending}
                >
                  {t('inventory.items.approve')}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

function LowStockTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((r) => r.data),
  });

  const createRequisition = useMutation({
    mutationFn: (itemId) =>
      api
        .post('/inventory/requisitions', { itemId, requestedQuantity: 10, reason: 'Low stock' })
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory-requisitions'] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <RecordList
        isLoading={isLoading}
        isEmpty={items.length === 0}
        emptyMessage={t('inventory.items.noLowStockItems')}
      >
        {items.map((item) => (
          <RecordListItem
            key={item._id}
            title={item.name}
            meta={`${item.sku} · ${item.category} · ${t('inventory.items.reorderLevelLabel')} ${
              item.reorderLevel
            }`}
            trailing={<span className="text-sm font-medium text-destructive">{item.quantity}</span>}
            footer={
              <Button
                size="sm"
                variant="outline"
                onClick={() => createRequisition.mutate(item._id)}
                disabled={createRequisition.isPending}
              >
                {t('inventory.items.createRequisition')}
              </Button>
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('inventory.items.tableSku'),
          t('common.name'),
          t('inventory.items.tableCategory'),
          t('inventory.items.tableQuantity'),
          t('inventory.items.reorderLevelLabel'),
          t('inventory.items.tableAction'),
        ]}
        isLoading={isLoading}
        isEmpty={items.length === 0}
        emptyMessage={t('inventory.items.noLowStockItems')}
      >
        {items.map((item) => (
          <TableRow key={item._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{item.sku}</TableCell>
            <TableCell className="px-4 py-3 font-medium">{item.name}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{item.category}</TableCell>
            <TableCell className="px-4 py-3 text-destructive font-medium">
              {item.quantity}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{item.reorderLevel}</TableCell>
            <TableCell className="px-4 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => createRequisition.mutate(item._id)}
                disabled={createRequisition.isPending}
              >
                {t('inventory.items.createRequisition')}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('items');
  const [movementsType, setMovementsType] = useState('');
  const [movementsOpenOnly, setMovementsOpenOnly] = useState(false);

  // Same query key LowStockTab uses, so the two share a cache entry instead
  // of double-fetching — the strip needs the count on every tab, not just
  // while Low Stock is active.
  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['inventory-low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((r) => r.data),
  });

  const { data: openIssues = [] } = useQuery({
    queryKey: ['inventory-open-issues-count'],
    queryFn: () => api.get('/inventory/movements?type=issue&returned=false').then((r) => r.data),
  });

  function handleTapLowStock() {
    setActiveTab('lowStock');
  }

  function handleTapNotReturned() {
    setMovementsType('issue');
    setMovementsOpenOnly(true);
    setActiveTab('movements');
  }

  const TAB_LABELS = {
    items: t('inventory.items.tabItems'),
    movements: t('inventory.items.tabMovements'),
    requisitions: t('inventory.items.tabRequisitions'),
    lowStock: t('inventory.items.tabLowStock'),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.inventory')} />

      <AttentionStrip
        lowStockCount={lowStockItems.length}
        notReturnedCount={openIssues.length}
        onTapLowStock={handleTapLowStock}
        onTapNotReturned={handleTapNotReturned}
      />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {activeTab === 'items' && <ItemsTab />}
      {activeTab === 'movements' && (
        <MovementsTab
          type={movementsType}
          onTypeChange={setMovementsType}
          openOnly={movementsOpenOnly}
          onOpenOnlyChange={setMovementsOpenOnly}
        />
      )}
      {activeTab === 'requisitions' && <RequisitionsTab />}
      {activeTab === 'lowStock' && <LowStockTab />}
    </div>
  );
}

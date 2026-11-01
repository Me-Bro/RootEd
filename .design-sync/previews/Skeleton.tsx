import { Skeleton } from 'rooted';

export function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 320 }}>
      <Skeleton style={{ height: 40, width: 40, borderRadius: 999 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <Skeleton style={{ height: 14, width: '70%' }} />
        <Skeleton style={{ height: 12, width: '45%' }} />
      </div>
    </div>
  );
}

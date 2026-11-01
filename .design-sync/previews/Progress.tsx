import { Progress, ProgressLabel, ProgressValue } from 'rooted';

export function Setup() {
  return (
    <div style={{ width: 320 }}>
      <Progress value={43}>
        <ProgressLabel>Set-up progress</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  );
}

export function Complete() {
  return (
    <div style={{ width: 320 }}>
      <Progress value={100}>
        <ProgressLabel>Grades entered</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  );
}

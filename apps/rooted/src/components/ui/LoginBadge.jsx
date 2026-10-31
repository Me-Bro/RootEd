import { useTranslation } from 'react-i18next';
import { Badge } from './Badge.jsx';
import { LOGIN_BADGE_VARIANT } from '../../utils/loginState.js';

/** none | pending | active | suspended — see utils/loginState.js. */
export function LoginBadge({ state }) {
  const { t } = useTranslation();
  return (
    <Badge variant={LOGIN_BADGE_VARIANT[state] ?? 'default'} data-testid="login-state">
      {t(`common.loginState.${state}`)}
    </Badge>
  );
}

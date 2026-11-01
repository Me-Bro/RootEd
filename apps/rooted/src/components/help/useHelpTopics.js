import { isModuleEnabled } from '@rooted/shared/utils';
import { useAuth } from '../../contexts/useAuth.js';
import { HELP_TOPICS, visibleTopics } from '../../utils/helpTopics.js';

/** The help topics the signed-in user can act on. */
export function useHelpTopics() {
  const { user } = useAuth();
  return visibleTopics(user?.permissions ?? [], (m) => isModuleEnabled(user, m), HELP_TOPICS);
}

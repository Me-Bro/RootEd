import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.jsx';
import StudentBillingTab from './StudentBillingTab.jsx';
import StudentHistoryTimeline from './StudentHistoryTimeline.jsx';
import StudentVisitsTable from './StudentVisitsTable.jsx';
import { availableTabs } from '../../utils/studentTabs.js';

/**
 * A study-center learner's page below the header: Overview (the profile and its cards),
 * Visits, Billing and History. The open tab lives in `?tab=` so a link or a reload
 * lands on the same one; a tab the viewer may not open falls back to Overview.
 */
export default function StudyCenterStudentTabs({ studentId, student, permissions, overview }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabs = availableTabs({ permissions, student });
  const requested = params.get('tab');
  const active = tabs.includes(requested) ? requested : 'overview';

  function select(value) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'overview') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true }
    );
  }

  return (
    <Tabs value={active} onValueChange={select}>
      <TabsList variant="line" aria-label={t('studyCenter.studentTabs.label')}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(`studyCenter.studentTabs.${tab}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
        {overview}
      </TabsContent>
      {tabs.includes('visits') && (
        <TabsContent value="visits" className="pt-4">
          <StudentVisitsTable
            studentId={studentId}
            canMark={permissions.includes('attendance:write')}
            active={student.status === 'active'}
          />
        </TabsContent>
      )}
      {tabs.includes('billing') && (
        <TabsContent value="billing" className="pt-4">
          <StudentBillingTab
            studentId={studentId}
            canWrite={permissions.includes('fees:write')}
            canCollect={permissions.includes('fees:collect')}
            canRefund={permissions.includes('tenant:admin')}
            canAddDiscount={permissions.includes('tenant:admin')}
            learnerName={`${student.firstName} ${student.lastName}`}
          />
        </TabsContent>
      )}
      <TabsContent value="history" className="pt-4">
        <StudentHistoryTimeline studentId={studentId} />
      </TabsContent>
    </Tabs>
  );
}

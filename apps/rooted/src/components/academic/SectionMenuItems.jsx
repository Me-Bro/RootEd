import { useTranslation } from 'react-i18next';
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem } from '../ui/dropdown-menu.jsx';
import { useTeachingLoad } from '../../hooks/useTeachingLoad.js';
import { mySectionIds } from '../../utils/teachingLinks.js';

/**
 * The section list for an Attendance or Grades picker: the signed-in teacher's own
 * classes first, then every other class. Nothing is hidden and no section is listed
 * twice, so a substitute can still reach any class.
 */
export default function SectionMenuItems({ classes, onPick }) {
  const { t } = useTranslation();
  const { items } = useTeachingLoad();
  const mine = mySectionIds(items);

  const mineSections = classes.flatMap((c) =>
    (c.sections || []).filter((s) => mine.has(s._id)).map((s) => ({ ...s, className: c.name }))
  );

  return (
    <>
      {mineSections.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('academic.myClasses.menuHeading')}</DropdownMenuLabel>
          {mineSections.map((s) => (
            <DropdownMenuItem key={s._id} onClick={() => onPick(s._id)}>
              {s.className} - {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      )}
      {classes.map((c) => {
        const rest = (c.sections || []).filter((s) => !mine.has(s._id));
        if (rest.length === 0) return null;
        return (
          <DropdownMenuGroup key={c._id}>
            <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
            {rest.map((s) => (
              <DropdownMenuItem key={s._id} onClick={() => onPick(s._id)}>
                {c.name} - {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        );
      })}
    </>
  );
}

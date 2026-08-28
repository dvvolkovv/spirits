import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson } from '../api';
import { loadDay, type Block, type EventsBlock, type TaskRow } from './dayData';
import { Card } from '../../shared/ui/Card';

export function DayScreen() {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<Block<string>>(null);
  const [events, setEvents] = useState<EventsBlock>(null);
  const [tasks, setTasks] = useState<Block<TaskRow[]>>(null);

  useEffect(() => {
    loadDay({
      getWidgetContent: () => getJson('/webhook/app-widget/content'),
      getCalendarStatus: () => getJson('/webhook/calendar/status'),
      getUserTasks: () => getJson('/webhook/user/tasks'),
    }).then((r) => {
      setFocus(r.focus);
      setEvents(r.events);
      setTasks(r.tasks);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">{t('tma.day.title')}</h1>

      {focus !== 'off' && (
        <section>
          <h2 className="text-sm font-medium text-gray-500">{t('tma.day.focus')}</h2>
          <p className="mt-1 text-lg">{focus === null ? '…' : focus}</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500">{t('tma.day.events')}</h2>
        {events === null && <p className="mt-1 text-gray-400">…</p>}
        {events === 'off' && (
          <div className="mt-1">
            <Card>
              <p>{t('tma.day.calendarOff')}</p>
              <p className="text-sm text-gray-500">{t('tma.day.calendarConnect')}</p>
            </Card>
          </div>
        )}
        {events === 'unavailable' && (
          <p className="mt-1 text-gray-400">{t('tma.day.eventsUnavailable')}</p>
        )}
      </section>

      {tasks !== 'off' && (
        <section>
          <h2 className="text-sm font-medium text-gray-500">{t('tma.day.tasks')}</h2>
          {tasks === null && <p className="mt-1 text-gray-400">…</p>}
          {Array.isArray(tasks) && tasks.length === 0 && (
            <p className="mt-1 text-gray-400">{t('tma.day.noTasks')}</p>
          )}
          <ul className="mt-1 flex flex-col gap-2">
            {Array.isArray(tasks) &&
              tasks.map((task) => (
                <li key={task.id}>
                  <Card>{task.title}</Card>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

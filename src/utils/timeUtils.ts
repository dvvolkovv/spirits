export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export const calculateTimeRemaining = (endTime: number): TimeRemaining => {
  const now = Date.now();
  const total = Math.max(0, endTime - now);

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, total };
};

export const formatTimeUnit = (value: number, singular: string, plural: string, genitive: string): string => {
  if (value % 10 === 1 && value % 100 !== 11) {
    return `${value} ${singular}`;
  }
  if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20)) {
    return `${value} ${genitive}`;
  }
  return `${value} ${plural}`;
};

export const getMaintenanceEndTime = (maintenanceTimeInSeconds: number): number => {
  return Date.now() + maintenanceTimeInSeconds * 1000;
};

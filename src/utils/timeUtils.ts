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


export const getMaintenanceEndTime = (maintenanceTimeInSeconds: number): number => {
  return Date.now() + maintenanceTimeInSeconds * 1000;
};

import React, { useEffect, useState, useCallback } from 'react';
import { Activity, Cpu, MemoryStick, HardDrive, Globe, Lock, AlertCircle, Loader, RefreshCw, Database, Zap, CheckCircle2, XCircle, Clock, MessageSquare, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

interface NodeRow {
  instance: string;
  host: string;
  up: boolean;
  load1: number | null;
  cpuPct: number | null;
  memPct: number | null;
  diskPct: number | null;
  uptimeSec: number | null;
}

interface ProbeRow {
  target: string;
  success: boolean;
  httpStatus: number | null;
  latencySec: number | null;
  tlsSecLeft: number | null;
}

interface PgRow {
  instance: string;
  up: boolean;
  dbSizeBytes: number | null;
  connections: number | null;
  tps: number | null;
  cacheHitRatio: number | null;
  deadlocks: number | null;
}

interface RedisRow {
  instance: string;
  up: boolean;
  memoryUsedBytes: number | null;
  connectedClients: number | null;
  opsPerSec: number | null;
  keyspaceHitRatio: number | null;
  evictedKeys: number | null;
}

interface MinioRow {
  instance: string;
  up: boolean;
  buckets: number | null;
  objects: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
}

interface Overview {
  nodes: NodeRow[];
  probes: ProbeRow[];
  generatedAt: string;
}

interface NginxRow {
  instance: string;
  up: boolean;
  activeConnections: number | null;
  reqPerSec: number | null;
  acceptedTotal: number | null;
  handledTotal: number | null;
  reading: number | null;
  writing: number | null;
  waiting: number | null;
}

interface Neo4jRow {
  instance: string;
  up: boolean;
  heapUsedBytes: number | null;
  heapMaxBytes: number | null;
  heapUsedPct: number | null;
  threads: number | null;
  gcTimeSecTotal: number | null;
  nodes: number | null;
  relationships: number | null;
}

interface DbOverview {
  postgres: PgRow[];
  redis: RedisRow[];
  minio: MinioRow[];
  nginx: NginxRow[];
  neo4j: Neo4jRow[];
  generatedAt: string;
}

interface SynthScenario {
  scenario: string;
  latestSuccess: boolean | null;
  latestTs: string | null;
  latestDurationMs: number | null;
  latestMessage: string | null;
  runs24h: number;
  successes24h: number;
  successRate24hPct: number | null;
}

interface SynthOverview {
  generatedAt: string;
  scenarios: SynthScenario[];
}

interface SmsOverview {
  generatedAt: string;
  balance: { rub: number | null; fetchedAt: string; error: string | null };
  alertThresholdRub: number;
  success24h: number;
  failure24h: number;
  failureRatePct24h: number | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

interface OpenRouterOverview {
  generatedAt: string;
  balance: {
    usd: number | null;
    totalCredits: number | null;
    totalUsage: number | null;
    fetchedAt: string;
    error: string | null;
  };
  alertThresholdUsd: number;
  configured: boolean;
}

interface ElevenLabsOverview {
  generatedAt: string;
  balance: {
    charactersLeft: number | null;
    charactersUsed: number | null;
    charactersLimit: number | null;
    tier: string | null;
    nextResetUnix: number | null;
    fetchedAt: string;
    error: string | null;
  };
  alertThresholdChars: number;
  configured: boolean;
}

interface BackupArtifact {
  name: string;
  expected: boolean;
  present: boolean;
  sizeBytes: number | null;
  integrityOk: boolean | null;
  error: string | null;
}

interface BackupSnapshot {
  dir: string;
  ts: string;
  ageHours: number;
  totalBytes: number;
  artifacts: BackupArtifact[];
  fresh: boolean;
  complete: boolean;
  healthy: boolean;
}

interface BackupOverview {
  generatedAt: string;
  backupRoot: string;
  freshHours: number;
  latest: BackupSnapshot | null;
  weekTotalGB: number | null;
  weekSnapshotCount: number;
  error: string | null;
}

interface ModelStatus {
  provider: string;
  model: string;
  kind: string;
  purpose: string;
  caller: string;
  via: string;
  calls_30d: number;
  cost_usd_30d: number;
  calls_24h: number;
  last_seen: string | null;
}
interface ModelsOverview {
  generatedAt: string;
  expected: ModelStatus[];
  unexpected: Array<{ model: string; source: string; calls_30d: number; last_seen: string | null }>;
  totals: {
    by_provider: Array<{ provider: string; calls_30d: number; cost_usd_30d: number }>;
    by_kind: Array<{ kind: string; calls_30d: number; cost_usd_30d: number }>;
  };
}

interface ReplicationOverview {
  generatedAt: string;
  standbys: Array<{
    pid: number;
    client_addr: string;
    application_name: string;
    state: string;
    sync_state: string;
    write_lag_sec: number | null;
    flush_lag_sec: number | null;
    replay_lag_sec: number | null;
    sent_lsn: string | null;
    replay_lsn: string | null;
    reply_time: string | null;
  }>;
  slots: Array<{
    slot_name: string;
    slot_type: string;
    active: boolean;
    active_pid: number | null;
    wal_status: string;
    restart_lsn: string | null;
    safe_wal_size_bytes: number | null;
  }>;
  standby: {
    configured: boolean;
    reachable: boolean;
    inRecovery: boolean | null;
    replayPaused: boolean | null;
    receiveLsn: string | null;
    replayLsn: string | null;
    applyBacklogBytes: number | null;
    lastXactReplayAgeSec: number | null;
    receiver: {
      status: string | null;
      senderHost: string | null;
      senderPort: number | null;
      slotName: string | null;
      writtenLsn: string | null;
      flushedLsn: string | null;
      latestEndLsn: string | null;
      lastMsgReceiptTime: string | null;
      sinceLastMsgSec: number | null;
    } | null;
    healthy: boolean;
    error: string | null;
  };
  healthy: boolean;
  maxReplayLagSec: number | null;
  thresholdSec: number;
  error: string | null;
}

interface NeoSnapshotOverview {
  generatedAt: string;
  configured: boolean;
  reachable: boolean;
  host: string | null;
  dir: string | null;
  files: Array<{
    name: string;
    localPresent: boolean;
    localSizeBytes: number | null;
    localMtime: string | null;
    localMd5: string | null;
    remotePresent: boolean;
    remoteSizeBytes: number | null;
    remoteMtime: string | null;
    remoteMd5: string | null;
    inSync: boolean;
    remoteAgeHours: number | null;
  }>;
  dumpSizeBytes: number | null;
  prevDumpSizeBytes: number | null;
  freshHours: number;
  healthy: boolean;
  error: string | null;
}

interface MinioMirrorOverview {
  generatedAt: string;
  configured: boolean;
  statusPresent: boolean;
  lastRunAt: string | null;
  ageMin: number | null;
  durationSec: number | null;
  drEndpoint: string | null;
  buckets: Array<{
    bucket: string;
    srcObjects: number;
    srcBytes: number;
    dstObjects: number;
    dstBytes: number;
    inSync: boolean;
  }>;
  totalSrcObjects: number | null;
  totalDstObjects: number | null;
  totalSrcBytes: number | null;
  totalDstBytes: number | null;
  errors: string[];
  freshMin: number;
  healthy: boolean;
  error: string | null;
}

interface JobsOverview {
  generatedAt: string;
  video: {
    status_counts: Record<string, number>;
    pending_total: number;
    oldest_pending_age_min: number | null;
    stuck: boolean;
    threshold_min: number;
  };
  tokens: {
    status_counts: Record<string, number>;
    pending_total: number;
    oldest_pending_age_sec: number | null;
    stuck: boolean;
    threshold_sec: number;
  };
  vpm_recent: Array<{
    id: string;
    trigger: string;
    cost_usd: number | null;
    duration_ms: number | null;
    ok: boolean;
    rec_count: number;
    created_at: string;
  }>;
  compaction: {
    schedule_human: string;
    next_run_in_h: number | null;
    last_run_at: string | null;
    active_profiles: number;
  };
}

interface ClaudeOverview {
  generatedAt: string;
  usage: {
    cost24hUsd: number | null;
    cost30dUsd: number | null;
    calls24h: number | null;
    calls30d: number | null;
    topModels30d: Array<{ model: string; calls: number; cost_usd: number }>;
    subscriptionType: string | null;
    subscriptionExpiresAt: string | null;
    apiKeyValid: boolean | null;
    apiKeyError: string | null;
    llmStatus: 'ok' | 'down' | null;
    llmOutageKind: string | null;
    llmError: string | null;
    llmCheckedAt: string | null;
    llmLatencyMs: number | null;
    fetchedAt: string;
  };
  alertThreshold30dUsd: number;
  configured: { apiKey: boolean; cliCredentials: boolean };
}

const SCENARIO_LABEL: Record<string, string> = {
  agents_endpoint:           'Каталог ассистентов',
  auth_flow_sms:             'SMS → OTP → JWT',
  profile_with_jwt:          'Профиль (JWT)',
  tokens_balance:            'Баланс токенов',
  chat_streaming:            'Стриминг чата',
  agent_avatar:              'Аватар ассистента',
  admin_monitoring_overview: 'Админ: мониторинг',
  funnel_endpoint:           'Админ: воронка',
};

const REFRESH_MS = 30_000;

// Инфра-страница раньше была одним длинным скроллом (14 секций). Разнесена на
// несколько вкладок ВТОРОГО уровня (рядом со «Сводка»/«Логи» в AdminMonitoringView):
// «Инфра» заменена на Хост / Интеграции / Резервы и DR / Задачи. Эта вьюха
// получает активную группу пропом `tab` и рендерит только её секции.
export type InfraTab = 'host' | 'integrations' | 'dr' | 'tasks';
export const INFRA_TABS: Array<{ id: InfraTab; label: string }> = [
  { id: 'host',         label: 'Хост' },
  { id: 'integrations', label: 'Интеграции' },
  { id: 'dr',           label: 'Резервы и DR' },
  { id: 'tasks',        label: 'Задачи' },
];

const formatUptime = (sec: number | null): string => {
  if (sec === null || !isFinite(sec)) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}д ${h}ч`;
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
};

const formatTlsDays = (sec: number | null): string =>
  sec === null ? '—' : `${Math.floor(sec / 86400)} дн.`;

const pctColor = (v: number | null, warn = 70, crit = 90): string => {
  if (v === null) return 'text-gray-400';
  if (v >= crit) return 'text-rose-600';
  if (v >= warn) return 'text-amber-600';
  return 'text-emerald-600';
};

const tlsDaysColor = (sec: number | null): string => {
  if (sec === null) return 'text-gray-400';
  const days = sec / 86400;
  if (days < 7) return 'text-rose-600';
  if (days < 30) return 'text-amber-600';
  return 'text-emerald-600';
};

const formatBytes = (n: number | null): string => {
  if (n === null) return '—';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
};

const formatRatio = (r: number | null): string =>
  r === null ? '—' : `${(r * 100).toFixed(1)}%`;

const formatNum = (n: number | null, digits = 0): string =>
  n === null ? '—' : n.toFixed(digits);

const hitRatioColor = (r: number | null): string => {
  if (r === null) return 'text-gray-400';
  if (r < 0.9) return 'text-rose-600';
  if (r < 0.98) return 'text-amber-600';
  return 'text-emerald-600';
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string; valueClass?: string }> = ({ icon, label, value, valueClass }) => (
  <div className="flex items-center justify-between py-2">
    <span className="flex items-center gap-2 text-sm text-gray-600">{icon}{label}</span>
    <span className={clsx('text-sm font-semibold', valueClass)}>{value}</span>
  </div>
);

const NodeCard: React.FC<{ row: NodeRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="font-semibold text-gray-900">{row.instance}</div>
        <div className="text-xs text-gray-500">{row.host}</div>
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<Cpu className="w-4 h-4" />} label="CPU" value={row.cpuPct !== null ? `${row.cpuPct.toFixed(0)}%` : '—'} valueClass={pctColor(row.cpuPct, 70, 90)} />
      <Metric icon={<MemoryStick className="w-4 h-4" />} label="RAM" value={row.memPct !== null ? `${row.memPct.toFixed(0)}%` : '—'} valueClass={pctColor(row.memPct, 80, 90)} />
      <Metric icon={<HardDrive className="w-4 h-4" />} label="Диск /" value={row.diskPct !== null ? `${row.diskPct.toFixed(0)}%` : '—'} valueClass={pctColor(row.diskPct, 70, 85)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Load1" value={row.load1 !== null ? row.load1.toFixed(2) : '—'} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Uptime" value={formatUptime(row.uptimeSec)} />
    </div>
  </div>
);

const PgCard: React.FC<{ row: PgRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-forest-600" />
        <div className="font-semibold text-gray-900">PostgreSQL · {row.instance}</div>
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<HardDrive className="w-4 h-4" />} label="Размер БД linkeon" value={formatBytes(row.dbSizeBytes)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Активных коннектов" value={formatNum(row.connections)} />
      <Metric icon={<Zap className="w-4 h-4" />} label="Commits/sec" value={formatNum(row.tps, 2)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Cache hit ratio" value={formatRatio(row.cacheHitRatio)} valueClass={hitRatioColor(row.cacheHitRatio)} />
      <Metric icon={<AlertCircle className="w-4 h-4" />} label="Deadlocks" value={formatNum(row.deadlocks)}
        valueClass={(row.deadlocks ?? 0) > 0 ? 'text-amber-600' : undefined} />
    </div>
  </div>
);

const Neo4jCard: React.FC<{ row: Neo4jRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-violet-600" />
        <div className="font-semibold text-gray-900">Neo4j · {row.instance}</div>
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<MemoryStick className="w-4 h-4" />} label="JVM heap"
        value={`${formatBytes(row.heapUsedBytes)} / ${formatBytes(row.heapMaxBytes)}`}
        valueClass={pctColor(row.heapUsedPct, 70, 90)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Heap %"
        value={row.heapUsedPct !== null ? `${row.heapUsedPct.toFixed(0)}%` : '—'}
        valueClass={pctColor(row.heapUsedPct, 70, 90)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="GC time (total)"
        value={row.gcTimeSecTotal !== null ? `${row.gcTimeSecTotal.toFixed(1)} с` : '—'} />
      <Metric icon={<Database className="w-4 h-4" />} label="Узлов"
        value={formatNum(row.nodes)} />
      <Metric icon={<Database className="w-4 h-4" />} label="Связей"
        value={formatNum(row.relationships)} />
    </div>
  </div>
);

const NginxCard: React.FC<{ row: NginxRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-emerald-600" />
        <div className="font-semibold text-gray-900">Nginx · {row.instance}</div>
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<Zap className="w-4 h-4" />} label="Req/sec (5м)"
        value={row.reqPerSec === null ? '—' : row.reqPerSec.toFixed(1)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Активных коннектов" value={formatNum(row.activeConnections)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Reading / Writing / Waiting"
        value={`${row.reading ?? '—'} / ${row.writing ?? '—'} / ${row.waiting ?? '—'}`} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Всего принято" value={formatNum(row.acceptedTotal)} />
    </div>
  </div>
);

const MinioCard: React.FC<{ row: MinioRow }> = ({ row }) => {
  const usedPct = row.usedBytes !== null && row.totalBytes && row.totalBytes > 0
    ? (row.usedBytes / row.totalBytes) * 100 : null;
  return (
    <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-600" />
          <div className="font-semibold text-gray-900">MinIO · {row.instance}</div>
        </div>
        <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
          {row.up ? 'UP' : 'DOWN'}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        <Metric icon={<HardDrive className="w-4 h-4" />} label="Использовано" value={formatBytes(row.usedBytes)}
          valueClass={usedPct !== null && usedPct > 85 ? 'text-rose-600' : usedPct !== null && usedPct > 70 ? 'text-amber-600' : undefined} />
        <Metric icon={<HardDrive className="w-4 h-4" />} label="Свободно" value={formatBytes(row.freeBytes)} />
        <Metric icon={<Database className="w-4 h-4" />} label="Бакетов" value={formatNum(row.buckets)} />
        <Metric icon={<Database className="w-4 h-4" />} label="Объектов" value={formatNum(row.objects)} />
      </div>
    </div>
  );
};

const RedisCard: React.FC<{ row: RedisRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-rose-500" />
        <div className="font-semibold text-gray-900">Redis · {row.instance}</div>
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<MemoryStick className="w-4 h-4" />} label="Память" value={formatBytes(row.memoryUsedBytes)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Клиентов" value={formatNum(row.connectedClients)} />
      <Metric icon={<Zap className="w-4 h-4" />} label="Ops/sec" value={formatNum(row.opsPerSec, 1)} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Keyspace hit ratio" value={formatRatio(row.keyspaceHitRatio)} valueClass={hitRatioColor(row.keyspaceHitRatio)} />
      <Metric icon={<AlertCircle className="w-4 h-4" />} label="Evicted keys" value={formatNum(row.evictedKeys)}
        valueClass={(row.evictedKeys ?? 0) > 0 ? 'text-amber-600' : undefined} />
    </div>
  </div>
);

const ProbeCard: React.FC<{ row: ProbeRow }> = ({ row }) => (
  <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', row.success ? 'border-gray-200' : 'border-rose-300 bg-rose-50')}>
    <div className="flex items-center justify-between mb-3">
      <div className="font-semibold text-gray-900 truncate" title={row.target}>
        {row.target.replace(/^https?:\/\//, '')}
      </div>
      <span className={clsx('text-xs font-medium px-2 py-1 rounded', row.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
        {row.success ? 'OK' : 'FAIL'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric icon={<Globe className="w-4 h-4" />} label="HTTP" value={row.httpStatus !== null ? String(row.httpStatus) : '—'}
        valueClass={row.httpStatus && row.httpStatus >= 200 && row.httpStatus < 400 ? 'text-emerald-600' : 'text-rose-600'} />
      <Metric icon={<Activity className="w-4 h-4" />} label="Latency" value={row.latencySec !== null ? `${(row.latencySec * 1000).toFixed(0)} ms` : '—'}
        valueClass={row.latencySec === null ? 'text-gray-400' : row.latencySec > 3 ? 'text-rose-600' : row.latencySec > 1.5 ? 'text-amber-600' : 'text-emerald-600'} />
      <Metric icon={<Lock className="w-4 h-4" />} label="TLS до истечения" value={formatTlsDays(row.tlsSecLeft)} valueClass={tlsDaysColor(row.tlsSecLeft)} />
    </div>
  </div>
);

const formatAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'только что';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
};

const SynthCard: React.FC<{ row: SynthScenario }> = ({ row }) => {
  const success = row.latestSuccess === true;
  const failed = row.latestSuccess === false;
  return (
    <div className={clsx(
      'rounded-lg border bg-white p-3 shadow-sm',
      success && 'border-emerald-200',
      failed && 'border-rose-300 bg-rose-50',
      !success && !failed && 'border-gray-200',
    )}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-medium text-gray-900 truncate" title={row.scenario}>
          {SCENARIO_LABEL[row.scenario] || row.scenario}
        </div>
        {success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
         : failed ? <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
         : <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </div>
      <div className="text-xs text-gray-500 flex items-center justify-between">
        <span>{formatAgo(row.latestTs)}</span>
        {row.latestDurationMs !== null && (
          <span>{row.latestDurationMs >= 1000 ? `${(row.latestDurationMs / 1000).toFixed(1)} с` : `${row.latestDurationMs} мс`}</span>
        )}
      </div>
      {row.successRate24hPct !== null && (
        <div className="text-xs text-gray-400 mt-1">
          24ч: {row.successes24h}/{row.runs24h} ({row.successRate24hPct.toFixed(0)}%)
        </div>
      )}
      {failed && row.latestMessage && (
        <div className="text-xs text-rose-700 mt-1 truncate" title={row.latestMessage}>{row.latestMessage}</div>
      )}
    </div>
  );
};

const MonitoringInfraView: React.FC<{ tab: InfraTab }> = ({ tab }) => {
  const [data, setData] = useState<Overview | null>(null);
  const [dbData, setDbData] = useState<DbOverview | null>(null);
  const [synthData, setSynthData] = useState<SynthOverview | null>(null);
  const [smsData, setSmsData] = useState<SmsOverview | null>(null);
  const [openrouterData, setOpenrouterData] = useState<OpenRouterOverview | null>(null);
  const [elevenlabsData, setElevenlabsData] = useState<ElevenLabsOverview | null>(null);
  const [claudeData, setClaudeData] = useState<ClaudeOverview | null>(null);
  const [backupsData, setBackupsData] = useState<BackupOverview | null>(null);
  const [modelsData, setModelsData] = useState<ModelsOverview | null>(null);
  const [jobsData, setJobsData] = useState<JobsOverview | null>(null);
  const [replData, setReplData] = useState<ReplicationOverview | null>(null);
  const [neoDrData, setNeoDrData] = useState<NeoSnapshotOverview | null>(null);
  const [minioDrData, setMinioDrData] = useState<MinioMirrorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [resOverview, resDb, resSynth, resSms, resOpenRouter, resElevenLabs, resClaude, resBackups, resModels, resJobs, resRepl, resNeoDr, resMinioDr] = await Promise.all([
        apiClient.get('/webhook/admin/monitoring/tech/overview'),
        apiClient.get('/webhook/admin/monitoring/tech/databases'),
        apiClient.get('/webhook/admin/monitoring/tech/synthetic'),
        apiClient.get('/webhook/admin/monitoring/tech/sms'),
        apiClient.get('/webhook/admin/monitoring/tech/openrouter'),
        apiClient.get('/webhook/admin/monitoring/tech/elevenlabs'),
        apiClient.get('/webhook/admin/monitoring/tech/claude'),
        apiClient.get('/webhook/admin/monitoring/tech/backups'),
        apiClient.get('/webhook/admin/monitoring/tech/models'),
        apiClient.get('/webhook/admin/monitoring/tech/jobs'),
        apiClient.get('/webhook/admin/monitoring/tech/replication'),
        apiClient.get('/webhook/admin/monitoring/tech/neo4j-dr'),
        apiClient.get('/webhook/admin/monitoring/tech/minio-dr'),
      ]);
      if (!resOverview.ok) {
        const body = await resOverview.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${resOverview.status}`);
      }
      setData(await resOverview.json());
      if (resDb.ok) setDbData(await resDb.json());
      if (resSynth.ok) setSynthData(await resSynth.json());
      if (resSms.ok) setSmsData(await resSms.json());
      if (resOpenRouter.ok) setOpenrouterData(await resOpenRouter.json());
      if (resElevenLabs.ok) setElevenlabsData(await resElevenLabs.json());
      if (resClaude.ok) setClaudeData(await resClaude.json());
      if (resBackups.ok) setBackupsData(await resBackups.json());
      if (resModels.ok) setModelsData(await resModels.json());
      if (resJobs.ok) setJobsData(await resJobs.json());
      if (resRepl.ok) setReplData(await resRepl.json());
      if (resNeoDr.ok) setNeoDrData(await resNeoDr.json());
      if (resMinioDr.ok) setMinioDrData(await resMinioDr.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить метрики');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader className="w-6 h-6 text-forest-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Обновлено: {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('ru-RU') : '—'}
          {' · автообновление каждые 30 с'}
        </p>
        <button onClick={() => load(false)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors">
          <RefreshCw className="w-4 h-4" />Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {tab === 'integrations' && smsData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">SMS Aero (пассивный мониторинг)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              smsData.balance.rub !== null && smsData.balance.rub <= smsData.alertThresholdRub
                ? 'border-rose-300 bg-rose-50'
                : smsData.balance.rub !== null && smsData.balance.rub <= smsData.alertThresholdRub * 2
                  ? 'border-amber-200'
                  : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Wallet className="w-3.5 h-3.5" />Баланс</div>
              <div className={clsx(
                'text-2xl font-semibold',
                smsData.balance.rub === null ? 'text-gray-500'
                  : smsData.balance.rub <= smsData.alertThresholdRub ? 'text-rose-600'
                  : smsData.balance.rub <= smsData.alertThresholdRub * 2 ? 'text-amber-600'
                  : 'text-emerald-600',
              )}>
                {smsData.balance.rub === null ? '—' : `${smsData.balance.rub.toFixed(2)} ₽`}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                порог алерта: {smsData.alertThresholdRub} ₽ · обновлено {new Date(smsData.balance.fetchedAt).toLocaleTimeString('ru-RU')}
              </div>
              {smsData.balance.error && (
                <div className="text-xs text-rose-700 mt-1 truncate" title={smsData.balance.error}>{smsData.balance.error}</div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><CheckCircle2 className="w-3.5 h-3.5" />Успехов за 24 ч</div>
              <div className="text-2xl font-semibold text-emerald-700">{smsData.success24h}</div>
              <div className="text-xs text-gray-400 mt-1">всего попыток: {smsData.success24h + smsData.failure24h}</div>
            </div>
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              smsData.failure24h > 0 ? 'border-amber-200' : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><XCircle className="w-3.5 h-3.5" />Ошибок за 24 ч</div>
              <div className={clsx('text-2xl font-semibold', smsData.failure24h > 0 ? 'text-amber-700' : 'text-gray-700')}>
                {smsData.failure24h}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                rate: {smsData.failureRatePct24h === null ? '—' : `${smsData.failureRatePct24h.toFixed(1)}%`}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><MessageSquare className="w-3.5 h-3.5" />Топ-причины ошибок (7 дн)</div>
              {smsData.topFailureReasons.length === 0 ? (
                <div className="text-sm text-gray-500 mt-1">— нет ошибок</div>
              ) : (
                <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
                  {smsData.topFailureReasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="truncate" title={r.reason}>{r.count} × {r.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'integrations' && openrouterData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">OpenRouter (LLM-провайдер)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              !openrouterData.configured
                ? 'border-gray-300 bg-gray-50'
                : openrouterData.balance.usd !== null && openrouterData.balance.usd <= openrouterData.alertThresholdUsd
                  ? 'border-rose-300 bg-rose-50'
                  : openrouterData.balance.usd !== null && openrouterData.balance.usd <= openrouterData.alertThresholdUsd * 2
                    ? 'border-amber-200'
                    : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Wallet className="w-3.5 h-3.5" />Баланс</div>
              <div className={clsx(
                'text-2xl font-semibold',
                !openrouterData.configured ? 'text-gray-500'
                  : openrouterData.balance.usd === null ? 'text-gray-500'
                  : openrouterData.balance.usd <= openrouterData.alertThresholdUsd ? 'text-rose-600'
                  : openrouterData.balance.usd <= openrouterData.alertThresholdUsd * 2 ? 'text-amber-600'
                  : 'text-emerald-600',
              )}>
                {openrouterData.balance.usd === null ? '—' : `$${openrouterData.balance.usd.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                порог: ${openrouterData.alertThresholdUsd} · обновлено {new Date(openrouterData.balance.fetchedAt).toLocaleTimeString('ru-RU')}
              </div>
              {!openrouterData.configured && (
                <div className="text-xs text-amber-700 mt-1">OPENROUTER_API_KEY не задан в .env</div>
              )}
              {openrouterData.balance.error && openrouterData.configured && (
                <div className="text-xs text-rose-700 mt-1 truncate" title={openrouterData.balance.error}>
                  {openrouterData.balance.error}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Куплено всего</div>
              <div className="text-2xl font-semibold text-gray-800">
                {openrouterData.balance.totalCredits === null ? '—' : `$${openrouterData.balance.totalCredits.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">total_credits</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Потрачено всего</div>
              <div className="text-2xl font-semibold text-gray-800">
                {openrouterData.balance.totalUsage === null ? '—' : `$${openrouterData.balance.totalUsage.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">total_usage</div>
            </div>
          </div>
        </section>
      )}

      {tab === 'dr' && backupsData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Резервные копии (ежедневный cron 03:00 UTC)</h3>
          {backupsData.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {backupsData.error}
            </div>
          ) : !backupsData.latest ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Нет ни одного снапшота в {backupsData.backupRoot}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={clsx(
                  'rounded-lg border bg-white p-4 shadow-sm',
                  backupsData.latest.healthy ? 'border-emerald-200'
                    : backupsData.latest.fresh ? 'border-amber-300 bg-amber-50'
                    : 'border-rose-300 bg-rose-50',
                )}>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><CheckCircle2 className="w-3.5 h-3.5" />Состояние</div>
                  <div className={clsx(
                    'text-2xl font-semibold',
                    backupsData.latest.healthy ? 'text-emerald-600'
                      : backupsData.latest.fresh ? 'text-amber-600'
                      : 'text-rose-600',
                  )}>
                    {backupsData.latest.healthy ? '✓ OK'
                      : backupsData.latest.fresh ? '⚠ проблема'
                      : '✗ протух'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {backupsData.latest.fresh
                      ? `свежий (порог ${backupsData.freshHours}ч)`
                      : `просрочен (порог ${backupsData.freshHours}ч)`}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Возраст</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {backupsData.latest.ageHours < 1
                      ? `${Math.round(backupsData.latest.ageHours * 60)} мин`
                      : `${backupsData.latest.ageHours.toFixed(1)} ч`}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(backupsData.latest.ts).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Размер последнего</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {(backupsData.latest.totalBytes / 1024 / 1024).toFixed(1)} МБ
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {backupsData.latest.artifacts.filter((a) => a.present).length} из {backupsData.latest.artifacts.filter((a) => a.expected).length} файлов
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">7-дневное окно</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {backupsData.weekSnapshotCount} / 7
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    суммарно {backupsData.weekTotalGB === null ? '—' : `${backupsData.weekTotalGB} ГБ`}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500 mb-2">Артефакты последнего снапшота</div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-1">Файл</th>
                      <th className="text-right py-1">Размер</th>
                      <th className="text-center py-1">Целостность</th>
                      <th className="text-left py-1 pl-3">Заметка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {backupsData.latest.artifacts.map((a) => (
                      <tr key={a.name} className={clsx(
                        a.expected && !a.present ? 'bg-rose-50'
                          : a.integrityOk === false ? 'bg-rose-50'
                          : '',
                      )}>
                        <td className="py-1.5 font-mono">{a.name}</td>
                        <td className="py-1.5 text-right text-gray-600">
                          {a.sizeBytes === null ? '—' : `${(a.sizeBytes / 1024).toFixed(0)} КБ`}
                        </td>
                        <td className="py-1.5 text-center">
                          {!a.present && a.expected ? <span className="text-rose-600">✗ нет</span>
                            : !a.present ? <span className="text-gray-400">—</span>
                            : a.integrityOk === true ? <span className="text-emerald-600">✓</span>
                            : a.integrityOk === false ? <span className="text-rose-600">✗</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-1.5 pl-3 text-gray-500 truncate max-w-md" title={a.error || ''}>
                          {a.error || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'integrations' && claudeData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Claude (Anthropic)</h3>

          {/* Статус «жив ли AI» — активная liveness-проба. Весь AI платформы на
              этой подписке, поэтому это статус продукта в целом. */}
          <div className={clsx(
            'rounded-lg border p-3 mb-3 flex items-start gap-2',
            claudeData.usage.llmStatus === 'down' ? 'border-rose-300 bg-rose-50'
              : claudeData.usage.llmStatus === 'ok' ? 'border-emerald-200 bg-emerald-50'
              : 'border-gray-200 bg-gray-50',
          )}>
            <span className="text-lg leading-none mt-0.5">
              {claudeData.usage.llmStatus === 'down' ? '🔴' : claudeData.usage.llmStatus === 'ok' ? '🟢' : '⚪'}
            </span>
            <div className="text-sm">
              <div className={clsx('font-semibold',
                claudeData.usage.llmStatus === 'down' ? 'text-rose-700'
                  : claudeData.usage.llmStatus === 'ok' ? 'text-emerald-700' : 'text-gray-600')}>
                {claudeData.usage.llmStatus === 'down' ? 'AI недоступен — деградация продукта'
                  : claudeData.usage.llmStatus === 'ok' ? 'AI отвечает'
                  : 'AI: статус ещё не проверялся'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {claudeData.usage.llmStatus === 'down' && claudeData.usage.llmError
                  ? <span className="text-rose-600">{claudeData.usage.llmError} · </span> : null}
                Живая проба LLM-пути (все ассистенты, Юля, Маша, Виртуальный PM/маркетолог).
                {claudeData.usage.llmCheckedAt ? ` Проверка: ${new Date(claudeData.usage.llmCheckedAt).toLocaleString('ru-RU')}` : ''}
                {claudeData.usage.llmLatencyMs != null ? ` · ${claudeData.usage.llmLatencyMs}мс` : ''}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              claudeData.usage.cost30dUsd !== null && claudeData.usage.cost30dUsd >= claudeData.alertThreshold30dUsd
                ? 'border-rose-300 bg-rose-50'
                : claudeData.usage.cost30dUsd !== null && claudeData.usage.cost30dUsd >= claudeData.alertThreshold30dUsd * 0.7
                  ? 'border-amber-200'
                  : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Wallet className="w-3.5 h-3.5" />Расход за 30 дней</div>
              <div className={clsx(
                'text-2xl font-semibold',
                claudeData.usage.cost30dUsd === null ? 'text-gray-500'
                  : claudeData.usage.cost30dUsd >= claudeData.alertThreshold30dUsd ? 'text-rose-600'
                  : claudeData.usage.cost30dUsd >= claudeData.alertThreshold30dUsd * 0.7 ? 'text-amber-600'
                  : 'text-emerald-600',
              )}>
                {claudeData.usage.cost30dUsd === null ? '—' : `$${claudeData.usage.cost30dUsd.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                порог алерта: ${claudeData.alertThreshold30dUsd} · {claudeData.usage.calls30d ?? 0} вызовов
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Расход за 24 ч</div>
              <div className="text-2xl font-semibold text-gray-800">
                {claudeData.usage.cost24hUsd === null ? '—' : `$${claudeData.usage.cost24hUsd.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">{claudeData.usage.calls24h ?? 0} вызовов</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Подписка CLI</div>
              <div className="text-2xl font-semibold text-gray-800 capitalize">
                {claudeData.usage.subscriptionType || '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {claudeData.usage.subscriptionExpiresAt
                  ? `до ${new Date(claudeData.usage.subscriptionExpiresAt).toLocaleDateString('ru-RU')}`
                  : claudeData.usage.subscriptionType
                    ? 'без срока'
                    : 'OAuth не найден'}
              </div>
            </div>
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              claudeData.usage.apiKeyValid === false ? 'border-rose-300 bg-rose-50' : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Anthropic API key</div>
              <div className={clsx(
                'text-2xl font-semibold',
                claudeData.usage.apiKeyValid === true ? 'text-emerald-600'
                  : claudeData.usage.apiKeyValid === false ? 'text-rose-600'
                  : 'text-gray-500',
              )}>
                {claudeData.usage.apiKeyValid === true ? '✓ valid'
                  : claudeData.usage.apiKeyValid === false ? '✗ invalid'
                  : '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {!claudeData.configured.apiKey
                  ? 'ANTHROPIC_API_KEY не задан'
                  : claudeData.usage.apiKeyError
                    ? <span className="text-rose-700">{claudeData.usage.apiKeyError.slice(0, 60)}</span>
                    : 'probe /v1/models раз в час'}
              </div>
            </div>
          </div>
          {claudeData.usage.topModels30d.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-2">Модели по расходу (30 дней)</div>
              <table className="w-full text-xs">
                <thead className="text-gray-500">
                  <tr><th className="text-left py-1">Модель</th><th className="text-right py-1">Вызовов</th><th className="text-right py-1">Расход</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claudeData.usage.topModels30d.map((m) => (
                    <tr key={m.model}>
                      <td className="py-1 font-mono">{m.model}</td>
                      <td className="py-1 text-right">{m.calls}</td>
                      <td className="py-1 text-right">${m.cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'dr' && replData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Репликация PostgreSQL</h3>
          {replData.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{replData.error}</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={clsx(
                  'rounded-lg border bg-white p-3 shadow-sm',
                  replData.healthy ? 'border-emerald-200' : 'border-rose-300 bg-rose-50',
                )}>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Состояние</div>
                  <div className={clsx('text-2xl font-semibold', replData.healthy ? 'text-emerald-600' : 'text-rose-600')}>
                    {replData.healthy ? '✓ healthy' : '✗ problem'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {replData.standbys.length} standby · порог лага {replData.thresholdSec}с
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Replay lag</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {replData.maxReplayLagSec === null ? '—' : `${replData.maxReplayLagSec.toFixed(2)} с`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">max по standby'ям</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Слоты</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {replData.slots.filter((s) => s.active).length} / {replData.slots.length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">активны / всего</div>
                </div>
              </div>

              {replData.standbys.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Адрес</th>
                        <th className="text-left px-3 py-2 font-medium">App</th>
                        <th className="text-left px-3 py-2 font-medium">State</th>
                        <th className="text-left px-3 py-2 font-medium">Sync</th>
                        <th className="text-right px-3 py-2 font-medium">write</th>
                        <th className="text-right px-3 py-2 font-medium">flush</th>
                        <th className="text-right px-3 py-2 font-medium">replay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {replData.standbys.map((sb) => (
                        <tr key={sb.pid}>
                          <td className="px-3 py-1.5 font-mono">{sb.client_addr}</td>
                          <td className="px-3 py-1.5">{sb.application_name}</td>
                          <td className="px-3 py-1.5">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10px]',
                              sb.state === 'streaming' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                            )}>{sb.state}</span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">{sb.sync_state}</td>
                          <td className="px-3 py-1.5 text-right">{sb.write_lag_sec === null ? '—' : `${sb.write_lag_sec.toFixed(2)}с`}</td>
                          <td className="px-3 py-1.5 text-right">{sb.flush_lag_sec === null ? '—' : `${sb.flush_lag_sec.toFixed(2)}с`}</td>
                          <td className={clsx(
                            'px-3 py-1.5 text-right',
                            sb.replay_lag_sec !== null && sb.replay_lag_sec > replData.thresholdSec && 'text-rose-700 font-medium',
                          )}>{sb.replay_lag_sec === null ? '—' : `${sb.replay_lag_sec.toFixed(2)}с`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {replData.standby.configured && (
                <div className={clsx(
                  'rounded-lg border bg-white p-3 shadow-sm',
                  replData.standby.error || !replData.standby.healthy ? 'border-rose-300 bg-rose-50' : 'border-emerald-200',
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Standby node-3 (со стороны реплики)
                    </div>
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px]',
                      replData.standby.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                    )}>
                      {replData.standby.healthy ? '✓ healthy' : replData.standby.reachable ? '✗ problem' : '✗ unreachable'}
                    </span>
                  </div>
                  {replData.standby.error ? (
                    <div className="text-xs text-rose-700">{replData.standby.error}</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <div className="text-gray-400">in_recovery</div>
                        <div className="font-medium">{replData.standby.inRecovery ? 'да' : 'нет'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">wal receiver</div>
                        <div className={clsx('font-medium', replData.standby.receiver?.status === 'streaming' ? 'text-emerald-700' : 'text-amber-700')}>
                          {replData.standby.receiver?.status ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">apply backlog</div>
                        <div className="font-medium font-mono">
                          {replData.standby.applyBacklogBytes === null ? '—' : formatBytes(replData.standby.applyBacklogBytes)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">replay paused</div>
                        <div className={clsx('font-medium', replData.standby.replayPaused && 'text-rose-700')}>
                          {replData.standby.replayPaused ? 'да' : 'нет'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">receive lsn</div>
                        <div className="font-medium font-mono">{replData.standby.receiveLsn ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">replay lsn</div>
                        <div className="font-medium font-mono">{replData.standby.replayLsn ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">slot / sender</div>
                        <div className="font-medium font-mono">
                          {replData.standby.receiver?.slotName ?? '—'}
                          {replData.standby.receiver?.senderHost ? ` @ ${replData.standby.receiver.senderHost}` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400" title="now() − last_xact_replay_timestamp; растёт в простое — справочно">
                          last replay age*
                        </div>
                        <div className="font-medium">
                          {replData.standby.lastXactReplayAgeSec === null ? '—' : `${replData.standby.lastXactReplayAgeSec.toFixed(0)} с`}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-2">
                    * растёт во время простоя записи — справочно, не влияет на health
                  </div>
                </div>
              )}

              {replData.slots.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Слот</th>
                        <th className="text-left px-3 py-2 font-medium">Тип</th>
                        <th className="text-left px-3 py-2 font-medium">Active</th>
                        <th className="text-left px-3 py-2 font-medium">WAL status</th>
                        <th className="text-left px-3 py-2 font-medium">restart_lsn</th>
                        <th className="text-right px-3 py-2 font-medium">safe_wal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {replData.slots.map((s) => (
                        <tr key={s.slot_name} className={clsx(s.wal_status === 'lost' && 'bg-rose-50')}>
                          <td className="px-3 py-1.5 font-mono">{s.slot_name}</td>
                          <td className="px-3 py-1.5 text-gray-500">{s.slot_type}</td>
                          <td className="px-3 py-1.5">
                            {s.active
                              ? <span className="text-emerald-700">✓</span>
                              : <span className="text-amber-700">—</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10px]',
                              s.wal_status === 'reserved' || s.wal_status === 'extended' ? 'bg-emerald-100 text-emerald-700'
                                : s.wal_status === 'unreserved' ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700',
                            )}>{s.wal_status}</span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-gray-500 truncate max-w-[200px]">{s.restart_lsn ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">
                            {s.safe_wal_size_bytes === null ? '—' : `${(s.safe_wal_size_bytes / 1024 / 1024).toFixed(0)} МБ`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'dr' && neoDrData && neoDrData.configured && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Neo4j DR-снапшот (node-3)</h3>
          {!neoDrData.reachable ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              node-3 недоступен: {neoDrData.error || 'unknown'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={clsx(
                  'rounded-lg border bg-white p-3 shadow-sm',
                  neoDrData.healthy ? 'border-emerald-200' : 'border-rose-300 bg-rose-50',
                )}>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Состояние</div>
                  <div className={clsx('text-2xl font-semibold', neoDrData.healthy ? 'text-emerald-600' : 'text-rose-600')}>
                    {neoDrData.healthy ? '✓ в синхроне' : '✗ проблема'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    порог свежести {neoDrData.freshHours}ч · ежедневный rsync
                  </div>
                </div>
                {(() => {
                  const dump = neoDrData.files.find((f) => f.name === 'neo4j.dump.gz');
                  return (
                    <>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Возраст копии</div>
                        <div className={clsx(
                          'text-2xl font-semibold',
                          dump?.remoteAgeHours != null && dump.remoteAgeHours > neoDrData.freshHours ? 'text-rose-600' : 'text-gray-800',
                        )}>
                          {dump?.remoteAgeHours == null ? '—' : `${dump.remoteAgeHours.toFixed(1)} ч`}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">на node-3 (mtime дампа)</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Размер дампа</div>
                        <div className="text-2xl font-semibold text-gray-800">
                          {neoDrData.dumpSizeBytes === null ? '—' : formatBytes(neoDrData.dumpSizeBytes)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {neoDrData.prevDumpSizeBytes === null
                            ? 'нет предыдущего'
                            : (() => {
                                const d = (neoDrData.dumpSizeBytes ?? 0) - neoDrData.prevDumpSizeBytes;
                                const pct = neoDrData.prevDumpSizeBytes ? (d / neoDrData.prevDumpSizeBytes) * 100 : 0;
                                return `пред.: ${formatBytes(neoDrData.prevDumpSizeBytes)} (${d >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
                              })()}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Файл</th>
                      <th className="text-left px-3 py-2 font-medium">прод</th>
                      <th className="text-left px-3 py-2 font-medium">node-3</th>
                      <th className="text-right px-3 py-2 font-medium">размер</th>
                      <th className="text-right px-3 py-2 font-medium">возраст</th>
                      <th className="text-left px-3 py-2 font-medium">md5</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {neoDrData.files.map((f) => (
                      <tr key={f.name}>
                        <td className="px-3 py-1.5 font-mono">{f.name}</td>
                        <td className="px-3 py-1.5">{f.localPresent
                          ? <span className="text-emerald-700">✓</span>
                          : <span className="text-rose-700">—</span>}</td>
                        <td className="px-3 py-1.5">{f.remotePresent
                          ? <span className="text-emerald-700">✓</span>
                          : <span className="text-rose-700">—</span>}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {f.remoteSizeBytes === null ? '—' : formatBytes(f.remoteSizeBytes)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {f.remoteAgeHours === null ? '—' : `${f.remoteAgeHours.toFixed(1)} ч`}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px]',
                            f.inSync ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                          )}>{f.inSync ? 'совпадает' : 'рассинхрон'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-gray-400">
                Цель: {neoDrData.host}:{neoDrData.dir} · md5 совпадает ⇒ копия байт-в-байт (прод-дамп уже прошёл gunzip-проверку)
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'dr' && minioDrData && minioDrData.configured && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">MinIO DR-зеркало (node-3)</h3>
          {minioDrData.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{minioDrData.error}</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={clsx(
                  'rounded-lg border bg-white p-3 shadow-sm',
                  minioDrData.healthy ? 'border-emerald-200' : 'border-rose-300 bg-rose-50',
                )}>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Состояние</div>
                  <div className={clsx('text-2xl font-semibold', minioDrData.healthy ? 'text-emerald-600' : 'text-rose-600')}>
                    {minioDrData.healthy ? '✓ покрыто' : '✗ проблема'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    ежечасный mc mirror · порог {(minioDrData.freshMin / 60).toFixed(0)}ч
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Последний sync</div>
                  <div className={clsx(
                    'text-2xl font-semibold',
                    minioDrData.ageMin != null && minioDrData.ageMin > minioDrData.freshMin ? 'text-rose-600' : 'text-gray-800',
                  )}>
                    {minioDrData.ageMin == null ? '—' : minioDrData.ageMin >= 60 ? `${(minioDrData.ageMin / 60).toFixed(1)} ч` : `${minioDrData.ageMin.toFixed(0)} мин`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    назад{minioDrData.durationSec != null ? ` · длился ${minioDrData.durationSec}с` : ''}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Объекты (node-3 / прод)</div>
                  <div className="text-2xl font-semibold text-gray-800">
                    {minioDrData.totalDstObjects ?? '—'} / {minioDrData.totalSrcObjects ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {minioDrData.totalDstBytes == null || minioDrData.totalSrcBytes == null
                      ? '—'
                      : `${formatBytes(minioDrData.totalDstBytes)} / ${formatBytes(minioDrData.totalSrcBytes)}`}
                  </div>
                </div>
              </div>

              {minioDrData.errors.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <div className="font-medium mb-1">Ошибки mc ({minioDrData.errors.length}):</div>
                  {minioDrData.errors.map((e, i) => <div key={i} className="font-mono truncate" title={e}>• {e}</div>)}
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Бакет</th>
                      <th className="text-right px-3 py-2 font-medium">объекты (node-3/прод)</th>
                      <th className="text-right px-3 py-2 font-medium">размер (node-3/прод)</th>
                      <th className="text-left px-3 py-2 font-medium">покрытие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {minioDrData.buckets.map((b) => (
                      <tr key={b.bucket}>
                        <td className="px-3 py-1.5 font-mono">{b.bucket}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{b.dstObjects} / {b.srcObjects}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{formatBytes(b.dstBytes)} / {formatBytes(b.srcBytes)}</td>
                        <td className="px-3 py-1.5">
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px]',
                            b.inSync ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                          )}>{b.inSync ? 'покрыт' : 'отстаёт'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-gray-400">
                {minioDrData.drEndpoint} · mirror без --remove ⇒ прод-удаления не каскадятся в DR (покрытие = node-3 содержит всё, что на проде)
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'tasks' && jobsData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Фоновые задачи</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Video jobs card */}
            <div className={clsx(
              'rounded-lg border bg-white p-3 shadow-sm',
              jobsData.video.stuck ? 'border-rose-300 bg-rose-50' : jobsData.video.pending_total > 0 ? 'border-amber-200' : 'border-gray-200',
            )}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Видео-задачи</div>
              <div className={clsx(
                'text-2xl font-semibold',
                jobsData.video.stuck ? 'text-rose-600' : jobsData.video.pending_total > 0 ? 'text-amber-600' : 'text-gray-800',
              )}>
                {jobsData.video.pending_total} <span className="text-base text-gray-400 font-normal">в работе</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {jobsData.video.oldest_pending_age_min === null
                  ? 'очередь пуста'
                  : `старейшее: ${jobsData.video.oldest_pending_age_min} мин${jobsData.video.stuck ? ` (порог ${jobsData.video.threshold_min})` : ''}`}
              </div>
              <div className="text-[10px] text-gray-400 mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(jobsData.video.status_counts).map(([s, n]) => (
                  <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100">{s}: {n}</span>
                ))}
              </div>
            </div>

            {/* Token consumption card */}
            <div className={clsx(
              'rounded-lg border bg-white p-3 shadow-sm',
              jobsData.tokens.stuck ? 'border-rose-300 bg-rose-50' : 'border-gray-200',
            )}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Списание токенов</div>
              <div className={clsx(
                'text-2xl font-semibold',
                jobsData.tokens.stuck ? 'text-rose-600' : 'text-gray-800',
              )}>
                {jobsData.tokens.pending_total} <span className="text-base text-gray-400 font-normal">pending</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {jobsData.tokens.oldest_pending_age_sec === null
                  ? 'очередь чиста'
                  : `старейшее: ${jobsData.tokens.oldest_pending_age_sec}с (порог ${jobsData.tokens.threshold_sec}с)`}
              </div>
              <div className="text-[10px] text-gray-400 mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(jobsData.tokens.status_counts).slice(0, 4).map(([s, n]) => (
                  <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100">{s}: {n}</span>
                ))}
              </div>
            </div>

            {/* Profile compaction card */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Сжатие профилей</div>
              <div className="text-2xl font-semibold text-gray-800">
                {jobsData.compaction.active_profiles}
              </div>
              <div className="text-xs text-gray-500 mt-1">{jobsData.compaction.schedule_human}</div>
              <div className="text-[10px] text-gray-400 mt-1.5">
                {jobsData.compaction.next_run_in_h != null && `следующий запуск через ${jobsData.compaction.next_run_in_h.toFixed(1)}ч`}
              </div>
            </div>

            {/* VPM runs card */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Виртуальный PM</div>
              <div className="text-2xl font-semibold text-gray-800">
                {jobsData.vpm_recent.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">генераций (показано 5 последних)</div>
              <div className="mt-1.5 space-y-0.5 max-h-[60px] overflow-hidden">
                {jobsData.vpm_recent.slice(0, 3).map((r) => (
                  <div key={r.id} className="text-[10px] text-gray-500 flex items-center gap-1">
                    <span className={clsx('inline-block w-1.5 h-1.5 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <span>{new Date(r.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-gray-400">·</span>
                    <span>{r.rec_count} рек.</span>
                    {r.cost_usd != null && <><span className="text-gray-400">·</span><span>${r.cost_usd.toFixed(3)}</span></>}
                  </div>
                ))}
                {jobsData.vpm_recent.length === 0 && <div className="text-[10px] text-gray-400">пока ни одного</div>}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'integrations' && modelsData && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Используемые модели</h3>
            {modelsData.totals.by_provider.length > 0 && (
              <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                {modelsData.totals.by_provider.slice(0, 5).map((p) => (
                  <span key={p.provider} className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
                    {p.provider}: {p.calls_30d} / ${p.cost_usd_30d.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Провайдер</th>
                  <th className="text-left px-3 py-2 font-medium">Модель</th>
                  <th className="text-left px-3 py-2 font-medium">Тип</th>
                  <th className="text-left px-3 py-2 font-medium">Назначение</th>
                  <th className="text-right px-3 py-2 font-medium">24ч</th>
                  <th className="text-right px-3 py-2 font-medium">30д</th>
                  <th className="text-right px-3 py-2 font-medium">$ за 30д</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {modelsData.expected.map((m) => (
                  <tr key={`${m.provider}-${m.model}`} className={clsx(m.calls_30d === 0 && 'opacity-60')}>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{m.provider}</td>
                    <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap" title={`${m.caller} · via ${m.via}`}>
                      {m.model}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{m.kind}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-md truncate" title={m.purpose}>{m.purpose}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{m.calls_24h || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{m.calls_30d || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{m.cost_usd_30d > 0 ? `$${m.cost_usd_30d.toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {modelsData.unexpected.length > 0 && (
              <div className="px-3 py-2 border-t border-gray-200 bg-amber-50">
                <div className="text-xs text-amber-800">
                  Замечены неизвестные модели в `events` (нет в каталоге):
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {modelsData.unexpected.map((u) => (
                    <span key={u.model} className="text-xs px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-800" title={`${u.calls_30d} вызовов за 30д · ${u.source}`}>
                      {u.model} ({u.calls_30d})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'integrations' && elevenlabsData && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">ElevenLabs (TTS)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className={clsx(
              'rounded-lg border bg-white p-4 shadow-sm',
              !elevenlabsData.configured
                ? 'border-gray-300 bg-gray-50'
                : elevenlabsData.balance.charactersLeft !== null && elevenlabsData.balance.charactersLeft <= elevenlabsData.alertThresholdChars
                  ? 'border-rose-300 bg-rose-50'
                  : elevenlabsData.balance.charactersLeft !== null && elevenlabsData.balance.charactersLeft <= elevenlabsData.alertThresholdChars * 2
                    ? 'border-amber-200'
                    : 'border-gray-200',
            )}>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Wallet className="w-3.5 h-3.5" />Символов осталось</div>
              <div className={clsx(
                'text-2xl font-semibold',
                !elevenlabsData.configured ? 'text-gray-500'
                  : elevenlabsData.balance.charactersLeft === null ? 'text-gray-500'
                  : elevenlabsData.balance.charactersLeft <= elevenlabsData.alertThresholdChars ? 'text-rose-600'
                  : elevenlabsData.balance.charactersLeft <= elevenlabsData.alertThresholdChars * 2 ? 'text-amber-600'
                  : 'text-emerald-600',
              )}>
                {elevenlabsData.balance.charactersLeft === null
                  ? '—'
                  : elevenlabsData.balance.charactersLeft.toLocaleString('ru-RU')}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                порог: {elevenlabsData.alertThresholdChars.toLocaleString('ru-RU')} · обновлено {new Date(elevenlabsData.balance.fetchedAt).toLocaleTimeString('ru-RU')}
              </div>
              {!elevenlabsData.configured && (
                <div className="text-xs text-amber-700 mt-1">ELEVENLABS_API_KEY не задан в .env</div>
              )}
              {elevenlabsData.balance.error && elevenlabsData.configured && (
                <div className="text-xs text-rose-700 mt-1" title={elevenlabsData.balance.error}>
                  {elevenlabsData.balance.error}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">Использовано в этом цикле</div>
              <div className="text-2xl font-semibold text-gray-800">
                {elevenlabsData.balance.charactersUsed === null
                  ? '—'
                  : elevenlabsData.balance.charactersUsed.toLocaleString('ru-RU')}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                лимит: {elevenlabsData.balance.charactersLimit === null
                  ? '—'
                  : elevenlabsData.balance.charactersLimit.toLocaleString('ru-RU')}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">План / сброс</div>
              <div className="text-2xl font-semibold text-gray-800">
                {elevenlabsData.balance.tier || '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {elevenlabsData.balance.nextResetUnix
                  ? `обнуление: ${new Date(elevenlabsData.balance.nextResetUnix * 1000).toLocaleDateString('ru-RU')}`
                  : 'дата обнуления неизвестна'}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'tasks' && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Synthetic E2E (каждые 5 мин)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {synthData?.scenarios.map((s) => <SynthCard key={s.scenario} row={s} />)}
          </div>
          {synthData && synthData.scenarios.length === 0 && (
            <div className="text-sm text-gray-500">Runner ещё не отправил ни одного результата.
              На node-3 ожидается cron <code>synthetic-runner.js</code>.</div>
          )}
        </section>
      )}

      {tab === 'host' && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Узлы</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.nodes.map((n) => <NodeCard key={n.instance} row={n} />)}
          </div>
          {data && data.nodes.length === 0 && <div className="text-sm text-gray-500">Нет данных</div>}
        </section>
      )}

      {tab === 'host' && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Доступность сервисов</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.probes.map((p) => <ProbeCard key={p.target} row={p} />)}
          </div>
          {data && data.probes.length === 0 && <div className="text-sm text-gray-500">Нет данных</div>}
        </section>
      )}

      {tab === 'host' && (
        <section>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Базы данных</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbData?.postgres.map((r) => <PgCard key={`pg-${r.instance}`} row={r} />)}
            {dbData?.redis.map((r) => <RedisCard key={`r-${r.instance}`} row={r} />)}
            {dbData?.neo4j?.map((r) => <Neo4jCard key={`n4-${r.instance}`} row={r} />)}
            {dbData?.minio.map((r) => <MinioCard key={`m-${r.instance}`} row={r} />)}
            {dbData?.nginx.map((r) => <NginxCard key={`n-${r.instance}`} row={r} />)}
          </div>
          {dbData && dbData.postgres.length === 0 && dbData.redis.length === 0 && dbData.minio.length === 0 && dbData.nginx?.length === 0 && (
            <div className="text-sm text-gray-500">Экспортёры баз ещё не подключены</div>
          )}
        </section>
      )}
    </div>
  );
};

export default MonitoringInfraView;

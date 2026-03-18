const STATUS_MAP = {
  answered:     { cls: 'status-badge-answered',  dot: 'bg-green-400',  label: 'Answered'   },
  answered_dtmf:{ cls: 'status-badge-answered',  dot: 'bg-green-400',  label: 'Answered'   },
  called:       { cls: 'status-badge-called',    dot: 'bg-green-400',  label: 'Called'     },
  completed:    { cls: 'status-badge-completed', dot: 'bg-green-400',  label: 'Completed'  },
  running:      { cls: 'status-badge-running',   dot: 'bg-blue-400',   label: 'Running'    },
  pending:      { cls: 'status-badge-pending',   dot: 'bg-blue-400',   label: 'Pending'    },
  calling:      { cls: 'status-badge-calling',   dot: 'bg-purple-400', label: 'Calling'    },
  no_dtmf:      { cls: 'status-badge-noanswer',  dot: 'bg-orange-400', label: 'No DTMF'   },
  noanswer:     { cls: 'status-badge-noanswer',  dot: 'bg-orange-400', label: 'No Answer'  },
  'no answer':  { cls: 'status-badge-noanswer',  dot: 'bg-orange-400', label: 'No Answer'  },
  paused:       { cls: 'status-badge-paused',    dot: 'bg-orange-400', label: 'Paused'     },
  failed:       { cls: 'status-badge-failed',    dot: 'bg-red-400',    label: 'Failed'     },
  stopped:      { cls: 'status-badge-stopped',   dot: 'bg-red-400',    label: 'Stopped'    },
  busy:         { cls: 'status-badge-busy',      dot: 'bg-purple-400', label: 'Busy'       },
};

export default function StatusBadge({ status, className = '' }) {
  const key = (status || '').toLowerCase();
  const s = STATUS_MAP[key] || {
    cls: 'status-badge-default',
    dot: 'bg-gray-500',
    label: status || 'Unknown',
  };

  return (
    <span className={`${s.cls} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

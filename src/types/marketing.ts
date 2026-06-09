export type StepType = 'auto_email' | 'manual_email' | 'phone_call' | 'li_connect' | 'li_message' | 'li_view' | 'li_interact';

export interface StepVariant {
  subject: string;
  body: string;
}

export interface EmailStep {
  id: string;
  day: number;
  waitUnit: 'hours' | 'days';
  type: StepType;
  subject: string;
  body: string;
  variantB?: StepVariant;
  abEnabled?: boolean;
  followUpRule: string;
  taskNote?: string;
  taskPriority?: 'low' | 'medium' | 'high';
}

export interface SequenceStats {
  active: number;
  paused: number;
  finished: number;
  bounced: number;
  notSent: number;
  scheduled: number;
  delivered: number;
  replied: number;
  interested: number;
  optedOut: number;
}

export interface SequenceActivity {
  id: string;
  text: string;
  timestamp: string;
}

export interface EmailSequence {
  id: string;
  name: string;
  goal: string;
  steps: EmailStep[];
  status: 'draft' | 'active' | 'paused';
  createdAt: string;
  enrolledCount: number;
  stats?: SequenceStats;
  activity?: SequenceActivity[];
}

export type AutomationNodeType =
  | 'trigger'
  | 'wait'
  | 'condition'
  | 'send_email'
  | 'send_sms'
  | 'add_tag'
  | 'remove_tag'
  | 'create_task'
  | 'assign_to'
  | 'update_field'
  | 'end';

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  label: string;
  config: Record<string, string>;
  nextId: string | null;
  yesId?: string | null;
  noId?: string | null;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  nodes: AutomationNode[];
  createdAt: string;
  enrolledCount: number;
  completedCount: number;
}

export interface FieldMapping {
  csvHeader: string;
  crmField: string;
}

export interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
}

export type ItemType = 'task' | 'event' | 'reminder';
export type Priority = 'none' | 'low' | 'med' | 'high';
export type ListType = string;
export type ViewType = 'todo' | 'calendar' | 'today' | 'upcoming' | 'settings';

export interface TaskItem {
  id: string;
  type: ItemType;
  title: string;
  desc: string;
  date: string;
  time: string;
  enddate?: string;
  endtime?: string;
  location?: string;
  priority: Priority;
  list: ListType;
  done: boolean;
  created: number;
}

export interface AppUser {
  user_id: string;
  name: string;
  email: string;
  account_type: string;
  phone?: string;
  position?: string;
  company_name?: string;
  avatar_url?: string | null;
  background_url?: string | null;
  status?: string;
  plan?: string;
  default_list_id?: string;
  task_theme?: string;
  accent?: string;
  show_completed?: boolean;
}

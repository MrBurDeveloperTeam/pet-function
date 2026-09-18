export type Profile = {
  user_id: string;
  email: string;
  name: string | null;
  account_type: string | null;
  plan: 'free' | 'pro' | 'studio';
  avatar_url: string | null;
  clinic_id: string | null;
  status: string | null;
  phone: string | null;
  position: string | null;
  company_name: string | null;
  dob: string | null;
  country: string | null;
  specialty: string[] | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  agreed_to_terms: boolean;
  created_at: string;
  updated_at: string | null;
};

export type UsageQuota = {
  user_id: string;
  date: string;
  image_generations_used: number;
  video_generations_used: number;
};

export const PlanLimits = {
  free: { images: 5, videos: 2 },
  pro: { images: 50, videos: 15 },
  studio: { images: 999, videos: 999 },
} as const;

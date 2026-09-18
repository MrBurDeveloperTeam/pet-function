export type Generation = {
  id: string;
  user_id?: string;
  type: "image" | "video";
  mode: "text-to-image" | "image-to-image" | "text-to-video" | "image-to-video" | string;
  model: string;
  prompt: string;
  output_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  is_watermarked?: boolean;
  metadata?: Record<string, unknown> & {
    favorite?: boolean;
  };
  created_at: string;
};

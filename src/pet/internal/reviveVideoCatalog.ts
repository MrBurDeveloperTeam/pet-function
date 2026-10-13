// eLearning's public browser configuration, not a service-role credential.
const url = "https://opdotszsldcgwjqtvgul.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wZG90c3pzbGRjZ3dqcXR2Z3VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTMwMTgsImV4cCI6MjA4MzMyOTAxOH0.rD_bjCil2I3nYBlilYUObObR0oUkbDbBQN4mCmtwLXI";
export interface ReviveVideo { video_id: string; title: string; channel_name: string }
export async function loadReviveVideos(): Promise<ReviveVideo[]> {
  const batches=await Promise.all(['*mr*bur*','*kaneiko*'].map(async channel=>{
    const query=new URL(url+'/rest/v1/dental_videos');
    query.searchParams.set('select','video_id,title,channel_name');
    query.searchParams.set('channel_name','ilike.'+channel);
    query.searchParams.set('limit','200');
    const response=await fetch(query,{headers:{apikey:anonKey,Authorization:'Bearer '+anonKey},signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw Error('Video library unavailable');
    return response.json();
  }));
  const rows:ReviveVideo[]=batches.flat();
  return [...new Map(rows.filter(v=>/^[a-zA-Z0-9_-]{11}$/.test(v.video_id)&&/mr[\s.]*bur|kaneiko/i.test(v.channel_name)).map(v=>[v.video_id,v])).values()];
}

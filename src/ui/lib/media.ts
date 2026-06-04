export function mediaUrl(meetingId: string, file: string): string {
  return `tmedia://m/${encodeURIComponent(meetingId)}/${encodeURIComponent(file)}`
}

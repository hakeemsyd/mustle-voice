alter table message
  add column attachment_url text;

comment on column message.attachment_url is
  'Signed URL to a user-attached photo or file in the chat-attachments storage bucket, if any. Persisted so an attached photo still renders after the chat history reloads, not just on the live response.';

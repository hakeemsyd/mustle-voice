insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 10485760)
on conflict (id) do nothing;

create policy chat_attachments_select_own on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy chat_attachments_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy chat_attachments_update_own on storage.objects for update to authenticated
  using (bucket_id = 'chat-attachments' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'chat-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy chat_attachments_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

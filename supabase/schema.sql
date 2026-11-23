-- Выполни весь SQL в Supabase → SQL Editor → New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null,
 display_name text not null default 'Пользователь',
 created_at timestamptz not null default now()
);
create table if not exists public.chats (
 id uuid primary key default gen_random_uuid(),
 title text,
 is_group boolean not null default false,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
 chat_id uuid not null references public.chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('admin','member')),
 joined_at timestamptz not null default now(),
 primary key(chat_id,user_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.chats(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null default '',
 attachment_url text,
 attachment_type text check(attachment_type is null or attachment_type in ('image','video','audio')),
 created_at timestamptz not null default now(),
 constraint message_has_content check(length(body)>0 or attachment_url is not null)
);
create index if not exists messages_chat_created_idx on public.messages(chat_id,created_at);

-- New user profile. Username can be changed later by adding a profile editor.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare uname text;
begin
 uname := lower(regexp_replace(split_part(coalesce(new.email,'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || substr(new.id::text,1,4);
 insert into public.profiles(id,username,display_name)
 values(new.id,uname,coalesce(new.raw_user_meta_data->>'display_name',uname))
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_chat_member(cid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.chat_members where chat_id=cid and user_id=auth.uid());
$$;
create or replace function public.create_direct_chat(other_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 if auth.uid() is null or other_user=auth.uid() then raise exception 'Invalid user'; end if;
 if not exists(select 1 from public.profiles where id=other_user) then raise exception 'User not found'; end if;
 select c.id into cid from public.chats c
 join public.chat_members a on a.chat_id=c.id and a.user_id=auth.uid()
 join public.chat_members b on b.chat_id=c.id and b.user_id=other_user
 where c.is_group=false limit 1;
 if cid is not null then return cid; end if;
 insert into public.chats(is_group,created_by) values(false,auth.uid()) returning id into cid;
 insert into public.chat_members(chat_id,user_id,role) values(cid,auth.uid(),'admin'),(cid,other_user,'member');
 return cid;
end; $$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles visible to signed-in users" on public.profiles for select to authenticated using(true);
create policy "profile owner can update" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "authenticated users create chats" on public.chats for insert to authenticated with check(created_by=auth.uid());
create policy "members read chats" on public.chats for select to authenticated using(public.is_chat_member(id));
create policy "members read membership" on public.chat_members for select to authenticated using(public.is_chat_member(chat_id));
create policy "add self or invite as chat admin" on public.chat_members for insert to authenticated with check(
 user_id=auth.uid() or exists(select 1 from public.chat_members cm where cm.chat_id=chat_id and cm.user_id=auth.uid() and cm.role='admin')
);
create policy "members read messages" on public.messages for select to authenticated using(public.is_chat_member(chat_id));
create policy "members send messages" on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.is_chat_member(chat_id));

-- Media bucket: public URLs for easy prototype playback; only chat members can upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-media','chat-media',true,31457280,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mp4'])
on conflict(id) do nothing;
create policy "chat members upload media" on storage.objects for insert to authenticated with check(
 bucket_id='chat-media' and public.is_chat_member((storage.foldername(name))[1]::uuid)
);
create policy "signed-in users read chat media" on storage.objects for select to authenticated using(bucket_id='chat-media');

-- Enable realtime for messages. If already added, ignore duplicate publication membership.
do $$ begin
 alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

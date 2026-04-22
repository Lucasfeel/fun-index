grant usage on schema app_public to anon, authenticated, service_role;

grant select on
  app_public.indicator_current_state,
  app_public.tab_feed_configs
to service_role;

create or replace function app_public.get_tab_feed(p_tab_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, app_public, ops
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tab', cfg.tab_code,
        'feedCardCode', cfg.feed_card_code,
        'title', coalesce(cur.summary ->> 'title', cfg.title),
        'subtitle', coalesce(cur.summary ->> 'subtitle', cfg.subtitle),
        'description', coalesce(cur.summary ->> 'description', cfg.description_template),
        'streamCode', s.stream_code,
        'metricCode', s.metric_code,
        'metricName', s.metric_name,
        'value', cur.current_value,
        'unit', s.unit,
        'observedAt', cur.observed_at,
        'summary', cur.summary
      )
      order by cfg.sort_order, cfg.feed_card_code
    ),
    '[]'::jsonb
  )
  from app_public.tab_feed_configs cfg
  join ops.indicator_streams s
    on s.id = cfg.stream_id
  join app_public.indicator_current_state cur
    on cur.stream_id = cfg.stream_id
   and cur.publish_state = 'published'
   and cur.blocked_until_review = false
  where cfg.tab_code = p_tab_code
    and cfg.is_enabled = true;
$$;

revoke all on function app_public.get_tab_feed(text) from public;
grant execute on function app_public.get_tab_feed(text) to anon, authenticated, service_role;

create or replace view public.public_indicator_signal_snapshots as
select
  ics.id::text as id,
  replace(ics.item_key, ':', '-') as slug,
  ics.tab_slug::text as domain,
  coalesce(ics.content ->> 'title', layout.title, ics.item_key) as title,
  coalesce(ics.content ->> 'subtitle', layout.subtitle, '') as subtitle,
  coalesce(ics.content ->> 'body', layout.body, '') as summary,
  coalesce((ics.content ->> 'valueNumeric')::numeric, 0) as score,
  coalesce(ics.content ->> 'direction', 'stable') as classification,
  0::numeric as change,
  ics.published_at as updated_at,
  case
    when coalesce((ics.content ->> 'confidence')::numeric, 0) >= 0.8 then 'high'
    when coalesce((ics.content ->> 'confidence')::numeric, 0) >= 0.5 then 'medium'
    else 'limited'
  end as confidence_band,
  null::text as freshness_note,
  null::text as uncertainty_note,
  '/' || ics.tab_slug || '/' || replace(ics.item_key, ':', '-') as detail_path,
  '[]'::jsonb as metrics,
  '[]'::jsonb as drivers,
  1 as cadence_hours,
  0 as sample_size,
  'Aggregate sample'::text as coverage_label,
  case
    when ics.item_key ilike '%pizza%' then 'pizza'
    when ics.item_key ilike '%gay-bar%' or ics.item_key ilike '%gay_bar%' then 'gay-bar'
    else null
  end as index_type,
  case
    when ics.item_key ilike '%fear%' or ics.item_key ilike '%greed%' then 'fear-greed'
    when ics.item_key ilike '%position%' then 'positioning-heat'
    when ics.tab_slug = 'psychology' then 'breadth-stress'
    else null
  end as indicator_type
from public.indicator_current_state ics
left join public.feed_layout_items layout
  on layout.tab_slug = ics.tab_slug
 and layout.item_key = ics.item_key
where ics.tab_slug in ('pentagon', 'psychology');

create or replace view public.public_social_signal_feed as
select
  fcs.id::text as id,
  replace(fcs.item_key, ':', '-') as slug,
  coalesce(fcs.content ->> 'title', layout.title, fcs.item_key) as title,
  coalesce(fcs.content ->> 'subtitle', layout.subtitle, '') as subtitle,
  coalesce(fcs.content ->> 'summary', layout.body, '') as summary,
  0::numeric as score,
  'approved'::text as classification,
  0::numeric as change,
  fcs.published_at as updated_at,
  'medium'::text as confidence_band,
  null::text as freshness_note,
  null::text as uncertainty_note,
  '/sns/' || replace(fcs.item_key, ':', '-') as detail_path,
  '[]'::jsonb as metrics,
  '[]'::jsonb as drivers,
  1 as cadence_hours,
  coalesce(jsonb_array_length(coalesce(fcs.content -> 'sourceItems', '[]'::jsonb)), 0) as source_count,
  '[]'::jsonb as categories,
  coalesce(fcs.content -> 'sourceItems', '[]'::jsonb) as sources,
  'Only items that passed the approval gate are surfaced in the user-facing feed.'::text as approval_note
from public.feed_current_state fcs
left join public.feed_layout_items layout
  on layout.tab_slug = fcs.tab_slug
 and layout.item_key = fcs.item_key
where fcs.is_current
  and fcs.item_kind = 'sns_rollup';

grant select on
  public.public_indicator_signal_snapshots,
  public.public_social_signal_feed
to anon, authenticated, service_role;

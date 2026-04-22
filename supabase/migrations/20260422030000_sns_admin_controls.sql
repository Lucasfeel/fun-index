update public.feed_layout_items
set
  is_visible = false,
  updated_at = timezone('utc', now())
where tab_slug = 'sns_feed'
  and item_key = 'sns:top-rollup';

insert into public.feed_layout_items (
  tab_slug,
  item_key,
  item_kind,
  source_ref,
  title,
  subtitle,
  body,
  order_index,
  is_visible,
  config
)
values
  (
    'sns_feed',
    'sns:trump',
    'sns_rollup',
    'sns_trump_rollup',
    '트럼프',
    '정치 이벤트 반응',
    '트럼프 관련 대화 흐름을 운영에서 직접 정리합니다.',
    10,
    true,
    jsonb_build_object('review_required', true, 'editor_owned', true)
  ),
  (
    'sns_feed',
    'sns:elon',
    'sns_rollup',
    'sns_elon_rollup',
    '일론',
    '인물 발언 반응',
    '일론 관련 대화와 밈 흐름을 운영에서 직접 조절합니다.',
    20,
    true,
    jsonb_build_object('review_required', true, 'editor_owned', true)
  ),
  (
    'sns_feed',
    'sns:kr-stock-community',
    'sns_rollup',
    'sns_kr_stock_community_rollup',
    '국내 주식 커뮤니티',
    '테마주/수급 대화',
    '국내 주식 커뮤니티 흐름을 운영에서 직접 정리합니다.',
    30,
    true,
    jsonb_build_object('review_required', true, 'editor_owned', true)
  ),
  (
    'sns_feed',
    'sns:global-stock-community',
    'sns_rollup',
    'sns_global_stock_community_rollup',
    '해외주식 커뮤니티',
    '미국장/거시 해석',
    '해외주식 커뮤니티 흐름을 운영에서 직접 정리합니다.',
    40,
    true,
    jsonb_build_object('review_required', true, 'editor_owned', true)
  )
on conflict (tab_slug, item_key) do update
set
  item_kind = excluded.item_kind,
  source_ref = excluded.source_ref,
  title = excluded.title,
  subtitle = excluded.subtitle,
  body = excluded.body,
  order_index = excluded.order_index,
  is_visible = excluded.is_visible,
  config = excluded.config,
  updated_at = timezone('utc', now());

create or replace view public.public_social_signal_feed as
select
  fcs.id::text as id,
  replace(fcs.item_key, ':', '-') as slug,
  coalesce(
    fcs.content ->> 'title',
    fcs.content -> 'override' ->> 'title',
    layout.title,
    fcs.item_key
  ) as title,
  coalesce(
    fcs.content ->> 'subtitle',
    fcs.content -> 'override' ->> 'subtitle',
    layout.subtitle,
    ''
  ) as subtitle,
  coalesce(
    fcs.content ->> 'summary',
    fcs.content -> 'override' ->> 'summary',
    fcs.content ->> 'body',
    fcs.content -> 'override' ->> 'body',
    layout.body,
    ''
  ) as summary,
  coalesce(
    nullif(fcs.content ->> 'score', '')::numeric,
    nullif(fcs.content ->> 'valueNumeric', '')::numeric,
    nullif(fcs.content -> 'override' ->> 'score', '')::numeric,
    nullif(fcs.content -> 'override' ->> 'valueNumeric', '')::numeric,
    0::numeric
  ) as score,
  coalesce(
    fcs.content ->> 'classification',
    fcs.content -> 'override' ->> 'classification',
    'approved'
  ) as classification,
  coalesce(
    nullif(fcs.content ->> 'change', '')::numeric,
    nullif(fcs.content -> 'override' ->> 'change', '')::numeric,
    0::numeric
  ) as change,
  fcs.published_at as updated_at,
  case
    when coalesce(
      nullif(fcs.content ->> 'confidence', '')::numeric,
      nullif(fcs.content -> 'override' ->> 'confidence', '')::numeric,
      0
    ) >= 0.8 then 'high'
    when coalesce(
      nullif(fcs.content ->> 'confidence', '')::numeric,
      nullif(fcs.content -> 'override' ->> 'confidence', '')::numeric,
      0
    ) >= 0.5 then 'medium'
    else 'limited'
  end as confidence_band,
  null::text as freshness_note,
  null::text as uncertainty_note,
  '/sns/' || replace(fcs.item_key, ':', '-') as detail_path,
  coalesce(
    fcs.content -> 'metrics',
    fcs.content -> 'override' -> 'metrics',
    '[]'::jsonb
  ) as metrics,
  coalesce(
    fcs.content -> 'drivers',
    fcs.content -> 'override' -> 'drivers',
    '[]'::jsonb
  ) as drivers,
  1 as cadence_hours,
  coalesce(
    nullif(fcs.content ->> 'sourceCount', '')::integer,
    nullif(fcs.content -> 'override' ->> 'sourceCount', '')::integer,
    jsonb_array_length(
      coalesce(
        fcs.content -> 'sourceItems',
        fcs.content -> 'override' -> 'sourceItems',
        '[]'::jsonb
      )
    ),
    0
  ) as source_count,
  coalesce(
    fcs.content -> 'categories',
    fcs.content -> 'override' -> 'categories',
    '[]'::jsonb
  ) as categories,
  coalesce(
    fcs.content -> 'sourceItems',
    fcs.content -> 'override' -> 'sourceItems',
    '[]'::jsonb
  ) as sources,
  coalesce(
    fcs.content ->> 'approvalNote',
    fcs.content -> 'override' ->> 'approvalNote',
    'Only items that passed the approval gate are surfaced in the user-facing feed.'
  ) as approval_note
from public.feed_current_state fcs
left join public.feed_layout_items layout
  on layout.tab_slug = fcs.tab_slug
 and layout.item_key = fcs.item_key
where fcs.is_current
  and fcs.item_kind = 'sns_rollup';

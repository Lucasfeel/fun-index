insert into public.providers (
  code,
  display_name,
  provider_kind,
  auth_state,
  legal_mode,
  source_health,
  freshness_sla_minutes,
  base_url,
  config,
  notes,
  is_enabled
)
values
  (
    'pizzint',
    'PizzINT',
    'indicator',
    'valid',
    'licensed_api',
    'healthy',
    90,
    'https://api.example.com/pizzint',
    jsonb_build_object('supports', jsonb_build_array('pizza_index', 'gay_bar_index')),
    'Primary source for Pentagon novelty indicators.',
    true
  ),
  (
    'cnn',
    'CNN',
    'sentiment',
    'not_required',
    'public_web',
    'healthy',
    120,
    'https://edition.cnn.com',
    jsonb_build_object('supports', jsonb_build_array('fear_greed')),
    'Used for fear-and-greed style market sentiment context.',
    true
  ),
  (
    'cmc',
    'CoinMarketCap',
    'sentiment',
    'valid',
    'licensed_api',
    'healthy',
    60,
    'https://pro-api.coinmarketcap.com',
    jsonb_build_object('supports', jsonb_build_array('fear_greed', 'market_breadth')),
    'Supplemental numeric market input.',
    true
  ),
  (
    'x',
    'X',
    'social',
    'valid',
    'restricted',
    'degraded',
    60,
    'https://api.x.com',
    jsonb_build_object('supports', jsonb_build_array('sns_rollups')),
    'Requires explicit legal mode review before expanding scope.',
    true
  )
on conflict (code) do update
set
  display_name = excluded.display_name,
  provider_kind = excluded.provider_kind,
  auth_state = excluded.auth_state,
  legal_mode = excluded.legal_mode,
  source_health = excluded.source_health,
  freshness_sla_minutes = excluded.freshness_sla_minutes,
  base_url = excluded.base_url,
  config = excluded.config,
  notes = excluded.notes,
  is_enabled = excluded.is_enabled,
  updated_at = timezone('utc', now());

insert into public.collection_jobs (
  slug,
  display_name,
  provider_id,
  job_type,
  schedule_cron,
  parser_version,
  pipeline_version,
  publish_behavior,
  timeout_seconds,
  retry_limit,
  is_enabled,
  config
)
values
  (
    'collect-pizzint-pizza-index',
    'Collect Pizza Index',
    (select id from public.providers where code = 'pizzint'),
    'collect_indicator',
    '0 * * * *',
    'pizzint-v1',
    'pipeline-v1',
    'review_gated',
    120,
    2,
    true,
    jsonb_build_object('indicator_key', 'pizza_index', 'tab_slug', 'pentagon')
  ),
  (
    'collect-pizzint-gay-bar-index',
    'Collect Gay Bar Index',
    (select id from public.providers where code = 'pizzint'),
    'collect_indicator',
    '5 * * * *',
    'pizzint-v1',
    'pipeline-v1',
    'review_gated',
    120,
    2,
    true,
    jsonb_build_object('indicator_key', 'gay_bar_index', 'tab_slug', 'pentagon')
  ),
  (
    'collect-cnn-fear-greed',
    'Collect Fear and Greed',
    (select id from public.providers where code = 'cnn'),
    'collect_indicator',
    '10 * * * *',
    'cnn-fg-v2',
    'pipeline-v1',
    'review_gated',
    120,
    1,
    true,
    jsonb_build_object('indicator_key', 'fear_greed_index', 'tab_slug', 'psychology')
  ),
  (
    'collect-cmc-market-psychology',
    'Collect Market Psychology Companion',
    (select id from public.providers where code = 'cmc'),
    'collect_indicator',
    '15 * * * *',
    'cmc-psych-v1',
    'pipeline-v1',
    'review_gated',
    120,
    1,
    true,
    jsonb_build_object('indicator_key', 'market_breadth', 'tab_slug', 'psychology')
  ),
  (
    'collect-x-sns-rollup',
    'Collect SNS Rollup Candidates',
    (select id from public.providers where code = 'x'),
    'collect_social',
    '20 * * * *',
    'x-rollup-v1',
    'pipeline-v1',
    'review_gated',
    180,
    1,
    true,
    jsonb_build_object('tab_slug', 'sns_feed')
  )
on conflict (slug) do update
set
  display_name = excluded.display_name,
  provider_id = excluded.provider_id,
  job_type = excluded.job_type,
  schedule_cron = excluded.schedule_cron,
  parser_version = excluded.parser_version,
  pipeline_version = excluded.pipeline_version,
  publish_behavior = excluded.publish_behavior,
  timeout_seconds = excluded.timeout_seconds,
  retry_limit = excluded.retry_limit,
  is_enabled = excluded.is_enabled,
  config = excluded.config,
  updated_at = timezone('utc', now());

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
    'home',
    'home:pentagon-highlight',
    'indicator_card',
    'pizza_index',
    'Pentagon Highlight',
    'Latest novelty signal',
    'Curated highlight from the Pentagon tab.',
    10,
    true,
    jsonb_build_object('source_tab', 'pentagon')
  ),
  (
    'home',
    'home:psychology-highlight',
    'indicator_card',
    'fear_greed_index',
    'Psychology Highlight',
    'Market mood at a glance',
    'Latest market emotion indicator.',
    20,
    true,
    jsonb_build_object('source_tab', 'psychology')
  ),
  (
    'home',
    'home:sns-highlight',
    'sns_rollup',
    'sns_feed_rollup',
    'SNS Highlight',
    'Approved social rollup',
    'Editor-approved social summary.',
    30,
    true,
    jsonb_build_object('source_tab', 'sns_feed')
  ),
  (
    'pentagon',
    'pentagon:pizza-index',
    'indicator_card',
    'pizza_index',
    'Pizza Index',
    'Crowd signal',
    'Tracks pizza-price and culture-linked shifts.',
    10,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'score'))
  ),
  (
    'pentagon',
    'pentagon:gay-bar-index',
    'indicator_card',
    'gay_bar_index',
    'Gay Bar Index',
    'Lifestyle signal',
    'Tracks nightlife-linked indicator movement.',
    20,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'score'))
  ),
  (
    'psychology',
    'psychology:fear-greed',
    'indicator_card',
    'fear_greed_index',
    'Fear & Greed',
    'Sentiment composite',
    'Fear-and-greed style market emotion index.',
    10,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'gauge'))
  ),
  (
    'psychology',
    'psychology:positioning-heat',
    'indicator_card',
    null,
    'Crypto Fear & Greed',
    'Crypto sentiment',
    'Crypto market emotion index for manual editorial updates.',
    20,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'gauge'), 'editor_owned', true)
  ),
  (
    'psychology',
    'psychology:market-breadth',
    'indicator_card',
    'market_breadth',
    'Market Breadth',
    'Participation signal',
    'Secondary psychology signal for context.',
    30,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'delta'))
  ),
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

-- Text-parser indicator pipeline seed rows.
insert into ops.provider_configs (
  provider_code,
  provider_family,
  display_name,
  adapter_key,
  parser_version,
  normalizer_version,
  validator_profile,
  fetch_config,
  metric_contract,
  is_active
)
values
  (
    'pizzint_pizza',
    'pizzint',
    'PizzINT Pizza Index',
    'pizzint_text',
    'pizzint-text-v1',
    'indicator-card-v2',
    jsonb_build_object('parserMode', 'html_plus_page_json'),
    jsonb_build_object('endpoint', 'https://www.pizzint.watch/', 'dashboardEndpoint', 'https://www.pizzint.watch/api/dashboard-data'),
    jsonb_build_object('bounds', jsonb_build_object('min', 0, 'max', 100)),
    true
  ),
  (
    'pizzint_gay_bar',
    'pizzint',
    'PizzINT Gay Bar Index',
    'pizzint_text',
    'pizzint-text-v1',
    'indicator-card-v2',
    jsonb_build_object('parserMode', 'html_plus_page_json', 'inverseVenueActivity', true),
    jsonb_build_object('endpoint', 'https://www.pizzint.watch/', 'dashboardEndpoint', 'https://www.pizzint.watch/api/dashboard-data'),
    jsonb_build_object('bounds', jsonb_build_object('min', 0, 'max', 100)),
    true
  ),
  (
    'cnn_us_stock_fng',
    'cnn_fear_greed',
    'CNN US Stock Fear & Greed',
    'cnn_fear_greed_text',
    'cnn-fng-text-v1',
    'indicator-card-v2',
    jsonb_build_object('parserMode', 'html_data_url'),
    jsonb_build_object('endpoint', 'https://edition.cnn.com/markets/fear-and-greed'),
    jsonb_build_object('bounds', jsonb_build_object('min', 0, 'max', 100)),
    true
  ),
  (
    'cmc_crypto_fng',
    'cmc_fear_greed',
    'CoinMarketCap Crypto Fear & Greed',
    'cmc_fear_greed_text',
    'cmc-fng-text-v1',
    'indicator-card-v2',
    jsonb_build_object('parserMode', 'next_data_with_footer_fallback'),
    jsonb_build_object('endpoint', 'https://coinmarketcap.com/ko/charts/fear-and-greed-index/'),
    jsonb_build_object('bounds', jsonb_build_object('min', 0, 'max', 100)),
    true
  ),
  (
    'kr_stock_fng',
    'kr_stock_fear_greed',
    'Korean Stock Fear & Greed',
    'kr_stock_fear_greed_text',
    'kr-fng-text-v1',
    'indicator-card-v2',
    jsonb_build_object('parserMode', 'html_exposed_json_endpoint'),
    jsonb_build_object('endpoint', 'https://feargreed.co.kr/'),
    jsonb_build_object('bounds', jsonb_build_object('min', 0, 'max', 100)),
    true
  )
on conflict (provider_code) do update
set
  provider_family = excluded.provider_family,
  display_name = excluded.display_name,
  adapter_key = excluded.adapter_key,
  parser_version = excluded.parser_version,
  normalizer_version = excluded.normalizer_version,
  validator_profile = excluded.validator_profile,
  fetch_config = excluded.fetch_config,
  metric_contract = excluded.metric_contract,
  is_active = excluded.is_active,
  updated_at = now();

insert into ops.indicator_streams (
  stream_code,
  tab_code,
  metric_code,
  metric_name,
  value_type,
  unit,
  min_value,
  max_value,
  publish_mode,
  requires_approval,
  is_aggregate_only,
  config,
  is_active
)
values
  ('pentagon_pizza_index', 'pentagon', 'pizza_index', 'Pizza Index', 'numeric', 'score', 0, 100, 'automatic', false, true, '{}'::jsonb, true),
  ('pentagon_gay_bar_index', 'pentagon', 'gay_bar_index', 'Gay Bar Index', 'numeric', 'score', 0, 100, 'automatic', false, true, '{}'::jsonb, true),
  ('psychology_us_stock_fear_greed', 'psychology', 'us_stock_fear_greed', 'US Stock Fear & Greed', 'numeric', 'score', 0, 100, 'automatic', false, true, '{}'::jsonb, true),
  ('psychology_crypto_fear_greed', 'psychology', 'crypto_fear_greed', 'Crypto Fear & Greed', 'numeric', 'score', 0, 100, 'automatic', false, true, '{}'::jsonb, true),
  ('psychology_kr_stock_fear_greed', 'psychology', 'kr_stock_fear_greed', 'Korean Stock Fear & Greed', 'numeric', 'score', 0, 100, 'automatic', false, true, '{}'::jsonb, true)
on conflict (stream_code) do update
set
  tab_code = excluded.tab_code,
  metric_code = excluded.metric_code,
  metric_name = excluded.metric_name,
  value_type = excluded.value_type,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  publish_mode = excluded.publish_mode,
  requires_approval = excluded.requires_approval,
  is_aggregate_only = excluded.is_aggregate_only,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

insert into ops.collection_jobs (
  job_code,
  provider_config_id,
  stream_id,
  schedule_cron,
  request_config,
  is_active,
  publish_enabled,
  locked_until_review,
  consecutive_failure_limit
)
values
  ('collect-pizzint-pizza-index-text', (select id from ops.provider_configs where provider_code = 'pizzint_pizza'), (select id from ops.indicator_streams where stream_code = 'pentagon_pizza_index'), '0 * * * *', jsonb_build_object('metric', 'pizza_index'), true, true, false, 2),
  ('collect-pizzint-gay-bar-index-text', (select id from ops.provider_configs where provider_code = 'pizzint_gay_bar'), (select id from ops.indicator_streams where stream_code = 'pentagon_gay_bar_index'), '5 * * * *', jsonb_build_object('metric', 'gay_bar_index'), true, true, false, 2),
  ('collect-cnn-us-stock-fng-text', (select id from ops.provider_configs where provider_code = 'cnn_us_stock_fng'), (select id from ops.indicator_streams where stream_code = 'psychology_us_stock_fear_greed'), '10 * * * *', jsonb_build_object('metric', 'us_stock_fear_greed'), true, true, false, 2),
  ('collect-cmc-crypto-fng-text', (select id from ops.provider_configs where provider_code = 'cmc_crypto_fng'), (select id from ops.indicator_streams where stream_code = 'psychology_crypto_fear_greed'), '15 * * * *', jsonb_build_object('metric', 'crypto_fear_greed'), true, true, false, 2),
  ('collect-kr-stock-fng-text', (select id from ops.provider_configs where provider_code = 'kr_stock_fng'), (select id from ops.indicator_streams where stream_code = 'psychology_kr_stock_fear_greed'), '20 * * * *', jsonb_build_object('metric', 'kr_stock_fear_greed'), true, true, false, 2)
on conflict (job_code) do update
set
  provider_config_id = excluded.provider_config_id,
  stream_id = excluded.stream_id,
  schedule_cron = excluded.schedule_cron,
  request_config = excluded.request_config,
  is_active = excluded.is_active,
  publish_enabled = excluded.publish_enabled,
  locked_until_review = excluded.locked_until_review,
  consecutive_failure_limit = excluded.consecutive_failure_limit,
  updated_at = now();

insert into app_public.tab_feed_configs (
  tab_code,
  stream_id,
  feed_card_code,
  title,
  subtitle,
  description_template,
  sort_order,
  is_enabled,
  config
)
values
  ('pentagon', (select id from ops.indicator_streams where stream_code = 'pentagon_pizza_index'), 'pentagon:pizza-index', 'Pizza Index', 'Pentagon-area activity', 'PizzINT composite activity around the Pentagon.', 10, true, jsonb_build_object('display', jsonb_build_object('format', 'score'))),
  ('pentagon', (select id from ops.indicator_streams where stream_code = 'pentagon_gay_bar_index'), 'pentagon:gay-bar-index', 'Gay Bar Index', 'Inverse nightlife activity', 'PizzINT nightlife quietness signal.', 20, true, jsonb_build_object('display', jsonb_build_object('format', 'score'))),
  ('psychology', (select id from ops.indicator_streams where stream_code = 'psychology_us_stock_fear_greed'), 'psychology:us-stock-fear-greed', 'US Stock Fear & Greed', 'CNN market sentiment', 'US equity fear-greed composite.', 10, true, jsonb_build_object('display', jsonb_build_object('format', 'gauge'))),
  ('psychology', (select id from ops.indicator_streams where stream_code = 'psychology_crypto_fear_greed'), 'psychology:crypto-fear-greed', 'Crypto Fear & Greed', 'CoinMarketCap sentiment', 'Crypto market fear-greed composite.', 20, true, jsonb_build_object('display', jsonb_build_object('format', 'gauge'))),
  ('psychology', (select id from ops.indicator_streams where stream_code = 'psychology_kr_stock_fear_greed'), 'psychology:kr-stock-fear-greed', 'Korean Stock Fear & Greed', 'KOSPI/KOSDAQ sentiment', 'Korean equity fear-greed composite.', 30, true, jsonb_build_object('display', jsonb_build_object('format', 'gauge')))
on conflict (tab_code, stream_id, feed_card_code) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description_template = excluded.description_template,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  config = excluded.config,
  updated_at = now();

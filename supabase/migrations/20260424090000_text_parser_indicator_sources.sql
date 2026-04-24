begin;

alter table ops.provider_configs
  drop constraint if exists provider_configs_provider_family_check;

alter table ops.provider_configs
  add constraint provider_configs_provider_family_check
  check (provider_family in ('pizzint', 'cnn_fear_greed', 'cmc_fear_greed', 'kr_stock_fear_greed', 'sns_rollup'));

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
    jsonb_build_object(
      'endpoint', 'https://www.pizzint.watch/',
      'dashboardEndpoint', 'https://www.pizzint.watch/api/dashboard-data'
    ),
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
    jsonb_build_object(
      'endpoint', 'https://www.pizzint.watch/',
      'dashboardEndpoint', 'https://www.pizzint.watch/api/dashboard-data'
    ),
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
  (
    'collect-pizzint-pizza-index-text',
    (select id from ops.provider_configs where provider_code = 'pizzint_pizza'),
    (select id from ops.indicator_streams where stream_code = 'pentagon_pizza_index'),
    '0 * * * *',
    jsonb_build_object('metric', 'pizza_index'),
    true,
    true,
    false,
    2
  ),
  (
    'collect-pizzint-gay-bar-index-text',
    (select id from ops.provider_configs where provider_code = 'pizzint_gay_bar'),
    (select id from ops.indicator_streams where stream_code = 'pentagon_gay_bar_index'),
    '5 * * * *',
    jsonb_build_object('metric', 'gay_bar_index'),
    true,
    true,
    false,
    2
  ),
  (
    'collect-cnn-us-stock-fng-text',
    (select id from ops.provider_configs where provider_code = 'cnn_us_stock_fng'),
    (select id from ops.indicator_streams where stream_code = 'psychology_us_stock_fear_greed'),
    '10 * * * *',
    jsonb_build_object('metric', 'us_stock_fear_greed'),
    true,
    true,
    false,
    2
  ),
  (
    'collect-cmc-crypto-fng-text',
    (select id from ops.provider_configs where provider_code = 'cmc_crypto_fng'),
    (select id from ops.indicator_streams where stream_code = 'psychology_crypto_fear_greed'),
    '15 * * * *',
    jsonb_build_object('metric', 'crypto_fear_greed'),
    true,
    true,
    false,
    2
  ),
  (
    'collect-kr-stock-fng-text',
    (select id from ops.provider_configs where provider_code = 'kr_stock_fng'),
    (select id from ops.indicator_streams where stream_code = 'psychology_kr_stock_fear_greed'),
    '20 * * * *',
    jsonb_build_object('metric', 'kr_stock_fear_greed'),
    true,
    true,
    false,
    2
  )
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
  (
    'pentagon',
    (select id from ops.indicator_streams where stream_code = 'pentagon_pizza_index'),
    'pentagon:pizza-index',
    'Pizza Index',
    'Pentagon-area activity',
    'PizzINT composite activity around the Pentagon.',
    10,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'score'))
  ),
  (
    'pentagon',
    (select id from ops.indicator_streams where stream_code = 'pentagon_gay_bar_index'),
    'pentagon:gay-bar-index',
    'Gay Bar Index',
    'Inverse nightlife activity',
    'PizzINT nightlife quietness signal.',
    20,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'score'))
  ),
  (
    'psychology',
    (select id from ops.indicator_streams where stream_code = 'psychology_us_stock_fear_greed'),
    'psychology:us-stock-fear-greed',
    'US Stock Fear & Greed',
    'CNN market sentiment',
    'US equity fear-greed composite.',
    10,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'gauge'))
  ),
  (
    'psychology',
    (select id from ops.indicator_streams where stream_code = 'psychology_crypto_fear_greed'),
    'psychology:crypto-fear-greed',
    'Crypto Fear & Greed',
    'CoinMarketCap sentiment',
    'Crypto market fear-greed composite.',
    20,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'gauge'))
  ),
  (
    'psychology',
    (select id from ops.indicator_streams where stream_code = 'psychology_kr_stock_fear_greed'),
    'psychology:kr-stock-fear-greed',
    'Korean Stock Fear & Greed',
    'KOSPI/KOSDAQ sentiment',
    'Korean equity fear-greed composite.',
    30,
    true,
    jsonb_build_object('display', jsonb_build_object('format', 'gauge'))
  )
on conflict (tab_code, stream_id, feed_card_code) do update
set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description_template = excluded.description_template,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  config = excluded.config,
  updated_at = now();

commit;

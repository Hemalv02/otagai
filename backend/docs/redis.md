# Redis and the job queue

Use `app.state.redis` for asynchronous cache access from the API. The cache uses Redis database 0. Dramatiq uses database 1.

Set `OTAGAI_REDIS_PORT` to a free host port if another Redis instance uses port 6379.

Start the worker from the repository root.

```sh
docker compose --profile worker up --build -d --wait
```

Use `enqueue_push` from `app.services.queue.worker` to queue an Expo push notification. Pass `delay_ms` to delay a notification.

Use generic push copy to keep private details off the lock screen. Add delayed ripple jobs when the request state and matching rules are available.

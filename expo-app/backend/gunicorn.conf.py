import multiprocessing

# Render free tier has limited memory
workers = 1  # Use only 1 worker
worker_class = "sync"
worker_connections = 1000
timeout = 120  # Increase timeout to 120 seconds
keepalive = 5

# Prevent memory issues
max_requests = 1000
max_requests_jitter = 50

# Binding
bind = "0.0.0.0:10000"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
# 0.1.5
- update hull-node version to 0.13.2
- make sure that we update `email` even for user which `customerio\created_at` trait

# 0.1.4
- fix for whitelisted segments
- account attributes are sent as distinct attributes rather than a nested object
- updated documentation
- added /status endpoint

# 0.1.3
- replace / with - to fix liquid template issues

# 0.1.2

- set created_at to a timestamp without miliseconds
- set hull_segments as array instead of a concatenated string
- don't save sent traits in customerio subgroup
- unset created_at when deleting user and unset deleted_at then pushing it again

# 0.1.1

- fix outgoing event filtering
- make webhook url token shorter (to fit in 255 C.io limit)
- fix deletion attribute loop

# 0.1.0

- allowing users to send users from Hull to Customer.io service

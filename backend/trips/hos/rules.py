"""Hours of Service limits for a property-carrying driver on the 70-hour/8-day cycle.

Source: 49 CFR 395 and the FMCSA Interstate Truck Driver's Guide to Hours of Service (April 2022).
All durations are in minutes.
"""

# 395.3(a)(3)(i)
MAX_DRIVING_MINUTES = 11 * 60
# 395.3(a)(2)
DUTY_WINDOW_MINUTES = 14 * 60
# 395.3(a)(3)(ii)
MAX_DRIVING_WITHOUT_BREAK_MINUTES = 8 * 60
MIN_BREAK_MINUTES = 30
# 395.3(a)(1)
DAILY_RESET_MINUTES = 10 * 60
# 395.3(b)(2)
CYCLE_LIMIT_MINUTES = 70 * 60
# 395.3(c)
CYCLE_RESTART_MINUTES = 34 * 60

# From the assessment brief.
MAX_MILES_BETWEEN_FUEL = 1000
PICKUP_MINUTES = 60
DROPOFF_MINUTES = 60

# Our planning assumptions, not regulation.
FUEL_STOP_MINUTES = 30
PRE_TRIP_INSPECTION_MINUTES = 30
POST_TRIP_INSPECTION_MINUTES = 15
# When a break falls due this close to needing fuel, fuel instead: one stop covers both.
FUEL_DURING_BREAK_WITHIN_MILES = 250

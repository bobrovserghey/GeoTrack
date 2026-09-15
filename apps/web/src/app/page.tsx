'use client';

import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

const LOGO_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI5IiB2aWV3Qm94PSIwIDAgMTg1IDI5IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOmMycGE9Imh0dHA6Ly9jMnBhLm9yZy9tYW5pZmVzdCI+PG1ldGFkYXRhPjxjMnBhOm1hbmlmZXN0PkFBQVdnbXAxYldJQUFBQWVhblZ0WkdNeWNHRUFFUUFRZ0FBQXFnQTRtM0VEWXpKd1lRQUFBQlpjYW5WdFlnQUFBRWRxZFcxa1l6SnRZUUFSQUJDQUFBQ3FBRGliY1FOMWNtNDZZekp3WVRwbVlqaGtZMkV5Tmkwd09EaGtMVFE0WWpZdE9HUTNZUzB3WVRVNFkyVmtZMk5rTldZQUFBQURsMnAxYldJQUFBQXBhblZ0WkdNeVlYTUFFUUFRZ0FBQXFnQTRtM0VEWXpKd1lTNWhjM05sY25ScGIyNXpBQUFBQUx4cWRXMWlBQUFBUkdwMWJXUmpZbTl5QUJFQUVJQUFBS29BT0p0eEUyTXljR0V1YVc1bmNtVmthV1Z1ZEM1Mk13QUFBQUFZWXpKemFDOTZKcjI1NmxQMGROZDZFVXhPL0o4QUFBQndZMkp2Y3FOcFpHTTZabTl5YldGMGJXbHRZV2RsTDNOMlp5dDRiV3hxYVc1emRHRnVZMlZKUkhnc2VHMXdPbWxwWkRveU1qWTRZbUl6T1MwM05EUTVMVFJqWVRBdE9EVXhaUzAxT0ROaU9XRTROakU1TVRSc2NtVnNZWFJwYjI1emFHbHdhSEJoY21WdWRFOW1BQUFCNG1wMWJXSUFBQUJCYW5WdFpHTmliM0lBRVFBUWdBQUFxZ0E0bTNFVFl6SndZUzVoWTNScGIyNXpMbll5QUFBQUFCaGpNbk5vL1EyVXlFOCtSeW1uODVtVFdzTjNQd0FBQVpsalltOXlvbWRoWTNScGIyNXpncUptWVdOMGFXOXVhMk15Y0dFdWIzQmxibVZrYW5CaGNtRnRaWFJsY25PaGEybHVaM0psWkdsbGJuUnpnYUpqZFhKc2VDMXpaV3htSTJwMWJXSm1QV015Y0dFdVlYTnpaWEowYVc5dWN5OWpNbkJoTG1sdVozSmxaR2xsYm5RdWRqTmthR0Z6YUZnZ1JEVEZvY2VrUE5hVkVxMXUvdGd6RUdkN0Nldzc3d3ZvaElKeGxIQzVMdytrWm1GamRHbHZibmdkWTI5dExtRnVkR2h5YjNCcFl5NWpiR0YxWkdVdWNISnZkbWxrWldScWNHRnlZVzFsZEdWeWM2RjRIMk52YlM1aGJuUm9jbTl3YVdNdWIzSnBaMmx1TFdOdmJtWnBaR1Z1WTJWbmRXNXJibTkzYm10a1pYTmpjbWx3ZEdsdmJuaG1RMnhoZFdSbElIQnliM1pwWkdWa0lIUm9hWE1nWm1sc1pTQmhkQ0IwYUdVZ2NtVnhkV1Z6ZENCdlppQmhJSFZ6WlhJZ1lXNWtJRzFoZVNCb1lYWmxJR055WldGMFpXUWdiM0lnYlc5a2FXWnBaV1FnZEdobElHWnBiR1VnWTI5dWRHVnVkSE11YlhOdlpuUjNZWEpsUVdkbGJuU2haRzVoYldWbVEyeGhkV1JsY21Gc2JFRmpkR2x2Ym5OSmJtTnNkV1JsWlBVQUFBRElhblZ0WWdBQUFFQnFkVzFrWTJKdmNnQVJBQkNBQUFDcUFEaWJjUk5qTW5CaExtaGhjMmd1WkdGMFlRQUFBQUFZWXpKemFFUXVUU0Fyd0s5MUltUGd1VG1waHVnQUFBQ0FZMkp2Y3FWallXeG5abk5vWVRJMU5tTndZV1JOQUFBQUFBQUFBQUFBQUFBQUFHUm9ZWE5vV0NEUkJuamRSY1dkMnhXb1N2aDhtZElmWEtJSHRGNEduRjFHOTk0VVNOdENMMlJ1WVcxbGJtcDFiV0ptSUcxaGJtbG1aWE4wYW1WNFkyeDFjMmx2Ym5PQm9tVnpkR0Z5ZEJpZ1pteGxibWQwYUJrZUJBQUFBajVxZFcxaUFBQUFKMnAxYldSak1tTnNBQkVBRUlBQUFLb0FPSnR4QTJNeWNHRXVZMnhoYVcwdWRqSUFBQUFDRDJOaWIzS2xZMkZzWjJaemFHRXlOVFpwYzJsbmJtRjBkWEpsZUUxelpXeG1JMnAxYldKbVBTOWpNbkJoTDNWeWJqcGpNbkJoT21aaU9HUmpZVEkyTFRBNE9HUXRORGhpTmkwNFpEZGhMVEJoTlRoalpXUmpZMlExWmk5ak1uQmhMbk5wWjI1aGRIVnlaV3BwYm5OMFlXNWpaVWxFZUN4NGJYQTZhV2xrT2pJeU1HWmhOVEk0TFRJNE1Ea3RORGxtWWkwNE1qRTNMVFkxWWpjeVpETTJNRGcwWW5KamNtVmhkR1ZrWDJGemMyVnlkR2x2Ym5PRG9tTjFjbXg0TFhObGJHWWphblZ0WW1ZOVl6SndZUzVoYzNObGNuUnBiMjV6TDJNeWNHRXVhVzVuY21Wa2FXVnVkQzUyTTJSb1lYTm9XQ0JFTk1XaHg2UTgxcFVTclc3KzJETVFaM3NKN0R2dkMraUVnbkdVY0xrdkQ2SmpkWEpzZUNwelpXeG1JMnAxYldKbVBXTXljR0V1WVhOelpYSjBhVzl1Y3k5ak1uQmhMbUZqZEdsdmJuTXVkakprYUdGemFGZ2dTTWt4NHByS1FvQzFWWkp4ZEplcmkwQ0ZEZi9KOVFmTzNnWG5vbXNNRndPaVkzVnliSGdwYzJWc1ppTnFkVzFpWmoxak1uQmhMbUZ6YzJWeWRHbHZibk12WXpKd1lTNW9ZWE5vTG1SaGRHRmthR0Z6YUZnZ1hscCtRcS9EWjdkcjZVQzRVdU5VRHdsSzAzRkVRVzB2MEFhNktIejhCQTEwWTJ4aGFXMWZaMlZ1WlhKaGRHOXlYMmx1Wm0ralpHNWhiV1Z2UVc1MGFISnZjR2xqSUVacGJHVnpaM1psY25OcGIyNWxNUzR3TGpCcmMzQmxZMVpsY25OcGIyNWxNaTQwTGpBQUFCQTRhblZ0WWdBQUFDaHFkVzFrWXpKamN3QVJBQkNBQUFDcUFEaWJjUU5qTW5CaExuTnBaMjVoZEhWeVpRQUFBQkFJWTJKdmN0S0VXUUlTb2dFbUdDRlpBZ293Z2dJR01JSUJqYUFEQWdFQ0FoUkE1YUFLN3NJNTBMNjRnL29HUWdVOVoxVVRBREFLQmdncWhrak9QUVFEQXpCSk1SY3dGUVlEVlFRS0V3NUJiblJvY205d2FXTXNJRkJDUXpFdU1Dd0dBMVVFQXhNbFFXNTBhSEp2Y0dsaklFTnZiblJsYm5RZ1EzSmxaR1Z1ZEdsaGJITWdVbTl2ZENCRFFUQWVGdzB5TmpBNE1EY3hPRFF6TlRaYUZ3MHlPREE0TURZeE9UUXpOVFphTUVReEZ6QVZCZ05WQkFvVERrRnVkR2h5YjNCcFl5d2dVRUpETVNrd0p3WURWUVFERXlCQmJuUm9jbTl3YVdNZ1EyeGhkV1JsSUVOdmJuUmxiblFnVTJsbmJtbHVaekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCSmg2Q212TFVCZ0ZGTlUwdlVLbE9WdEU2ZGpkMTdMNVN1d1gwTGVtRmlzQk0zZGtkLzNjeWp4RkEzUW81UzQ2ZlgwL2loWTBWWjdtZmI5S0Y3MDN0NU9qV0RCV01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBVkJnTlZIU1VFRGpBTUJnb3JCZ0VFQVlQb1hnSUJNQXdHQTFVZEV3RUIvd1FDTUFBd0h3WURWUjBqQkJnd0ZvQVV6bEhpQklGT1pGc2orT1BFejVvK25NSFhYTUl3Q2dZSUtvWkl6ajBFQXdNRFp3QXdaQUl3TVhNZEZKNEJldExMVlk3T1J1RTlub3FiYkFaT1puL2FBclh5VHdGQVpmS3JQenhGMnZQb0pOZjErVUNkZzFYR0FqQndYMXpkOVdHcVlrcW1MNVNGcXcxUXlTanIxekpmcEpNOSsxcmREd1NQTE1PUE9qS3VpWGpvVS9wVVVlRzlSd21oWTNCaFpGa05uZ0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQVBaWVFFb3ZJcnhlQ29oNGt5TTJNcjlUR1hWNktjd3pUT2piakxrekpXUWdiZUZJaDRwYWl5UEJSYnNwbk9QRUdqWDVyRVdkVlh5Y1BsMVJ0QWYxdVMvTTI3az08L2MycGE6bWFuaWZlc3Q+PC9tZXRhZGF0YT4KPHBhdGggZD0iTTE1MS4yMyAyMS45NDRMMTUxLjI0NiAxNy4wMTZMMTU5LjM1OCA4LjU1MjAxSDE2NC42ODZMMTUxLjIzIDIxLjk0NFpNMTQ4LjY4NiAyNVYyLjA4ODAxSDE1Mi45MjZWMjVIMTQ4LjY4NlpNMTU5Ljc3NCAyNUwxNTQuNTkgMTYuNzEyTDE1Ny41MzQgMTMuNzY4TDE2NC44OTQgMjVIMTU5Ljc3NFoiIGZpbGw9ImJsYWNrIj48L3BhdGg+CjxwYXRoIGQ9Ik0xMzguMzggMjUuNTEyQzEzNS44NzQgMjUuNTEyIDEzMy44MSAyNC42OTA3IDEzMi4xODggMjMuMDQ4QzEzMC41NjcgMjEuNDA1MyAxMjkuNzU2IDE5LjMwNCAxMjkuNzU2IDE2Ljc0NEMxMjkuNzU2IDE0LjE4NCAxMzAuNTY3IDEyLjA5MzMgMTMyLjE4OCAxMC40NzJDMTMzLjgyIDguODM5OTkgMTM1Ljg5IDguMDIzOTkgMTM4LjM5NiA4LjAyMzk5QzEzOS41MzggOC4wMjM5OSAxNDAuNTcyIDguMTgzOTkgMTQxLjUgOC41MDM5OUMxNDIuNDI4IDguODIzOTkgMTQzLjI2NiA5LjMyNTMyIDE0NC4wMTIgMTAuMDA4QzE0NC43NyAxMC42OCAxNDUuNDMxIDExLjY1NiAxNDUuOTk2IDEyLjkzNkwxNDIuNDQ0IDE0LjMyOEMxNDIuMDgyIDEzLjYxMzMgMTQxLjcxOSAxMy4wNzQ3IDE0MS4zNTYgMTIuNzEyQzE0MC45OTQgMTIuMzQ5MyAxNDAuNTY3IDEyLjA4MjcgMTQwLjA3NiAxMS45MTJDMTM5LjU4NiAxMS43MzA3IDEzOS4wNDcgMTEuNjQgMTM4LjQ2IDExLjY0QzEzNy4yMDIgMTEuNjQgMTM2LjEyNCAxMi4xMDkzIDEzNS4yMjggMTMuMDQ4QzEzNC4zMzIgMTMuOTg2NyAxMzMuODg0IDE1LjIxMzMgMTMzLjg4NCAxNi43MjhDMTMzLjg4NCAxOC4yNDI3IDEzNC4zMjcgMTkuNDg1MyAxMzUuMjEyIDIwLjQ1NkMxMzYuMDk4IDIxLjQxNiAxMzcuMTc1IDIxLjg5NiAxMzguNDQ0IDIxLjg5NkMxMzkuMDMxIDIxLjg5NiAxMzkuNTc1IDIxLjgwNTMgMTQwLjA3NiAyMS42MjRDMTQwLjU3OCAyMS40MzIgMTQxLjAxIDIxLjE3MDcgMTQxLjM3MiAyMC44NEMxNDEuNzM1IDIwLjQ5ODcgMTQyLjEyNCAxOS45NDQgMTQyLjU0IDE5LjE3NkwxNDYuMTA4IDIwLjQ0QzE0NS41MjIgMjEuNzUyIDE0NC44NjYgMjIuNzQ5MyAxNDQuMTQgMjMuNDMyQzE0My40MjYgMjQuMTA0IDE0Mi41ODMgMjQuNjIxMyAxNDEuNjEyIDI0Ljk4NEMxNDAuNjUyIDI1LjMzNiAxMzkuNTc1IDI1LjUxMiAxMzguMzggMjUuNTEyWiIgZmlsbD0iYmxhY2siPjwvcGF0aD4KPHBhdGggZD0iTTExNy41ODQgMjUuNTEyQzExNS43ODIgMjUuNTEyIDExNC4zMjYgMjUuMDIxMyAxMTMuMjE2IDI0LjA0QzExMi4xMDcgMjMuMDQ4IDExMS41NTIgMjEuNzUyIDExMS41NTIgMjAuMTUyQzExMS41NTIgMTguNDY2NyAxMTIuMTk4IDE3LjEzMzMgMTEzLjQ4OCAxNi4xNTJDMTE0Ljc5IDE1LjE2IDExNi40OCAxNC42NjQgMTE4LjU2IDE0LjY2NEMxMTkuNDAzIDE0LjY2NCAxMjAuMjE0IDE0Ljc1NDcgMTIwLjk5MiAxNC45MzZDMTIxLjc4MiAxNS4xMDY3IDEyMi40NDMgMTUuMzI1MyAxMjIuOTc2IDE1LjU5MlYxNC42MzJDMTIyLjk3NiAxMy41OTczIDEyMi42MTkgMTIuNzgxMyAxMjEuOTA0IDEyLjE4NEMxMjEuMTkgMTEuNTc2IDEyMC4yNTEgMTEuMjcyIDExOS4wODggMTEuMjcyQzExOC40MTYgMTEuMjcyIDExNy44NCAxMS4zNDY3IDExNy4zNiAxMS40OTZDMTE2Ljg5MSAxMS42MzQ3IDExNi40NTQgMTEuODI2NyAxMTYuMDQ4IDEyLjA3MkMxMTUuNjU0IDEyLjMxNzMgMTE1LjI5MSAxMi41OTQ3IDExNC45NiAxMi45MDRDMTE0LjY0IDEzLjIxMzMgMTE0LjQ4IDEzLjM2OCAxMTQuNDggMTMuMzY4TDExMi4wOTYgMTEuMDk2QzExMi4wOTYgMTEuMDk2IDExMi4zNTggMTAuODY2NyAxMTIuODggMTAuNDA4QzExMy40MTQgOS45NDkzMiAxMTMuOTk1IDkuNTM4NjUgMTE0LjYyNCA5LjE3NTk5QzExNS4yNTQgOC44MTMzMiAxMTUuOTYzIDguNTMwNjUgMTE2Ljc1MiA4LjMyNzk5QzExNy41NDIgOC4xMjUzMiAxMTguNDQ4IDguMDIzOTkgMTE5LjQ3MiA4LjAyMzk5QzEyMS44NTEgOC4wMjM5OSAxMjMuNzA3IDguNjA1MzIgMTI1LjA0IDkuNzY3OTlDMTI2LjM3NCAxMC45MiAxMjcuMDQgMTIuNTQxMyAxMjcuMDQgMTQuNjMyVjI1SDEyMi45OTJWMjEuNEwxMjQuMDMyIDIyLjgyNEgxMjIuODk2QzEyMi40MDYgMjMuNjI0IDEyMS42ODYgMjQuMjc0NyAxMjAuNzM2IDI0Ljc3NkMxMTkuNzk4IDI1LjI2NjcgMTE4Ljc0NyAyNS41MTIgMTE3LjU4NCAyNS41MTJaTTExOC42ODggMjIuNTUyQzExOS45MjYgMjIuNTUyIDEyMC45NDQgMjIuMTE0NyAxMjEuNzQ0IDIxLjI0QzEyMi41NTUgMjAuMzY1MyAxMjIuOTY2IDE5LjI2NjcgMTIyLjk3NiAxNy45NDRWMTcuOTI4QzEyMi41MTggMTcuNjUwNyAxMjEuOTc0IDE3LjQzMiAxMjEuMzQ0IDE3LjI3MkMxMjAuNzI2IDE3LjExMiAxMjAuMDY0IDE3LjAzMiAxMTkuMzYgMTcuMDMyQzExOC4yMTkgMTcuMDMyIDExNy4yOTYgMTcuMjcyIDExNi41OTIgMTcuNzUyQzExNS44OTkgMTguMjIxMyAxMTUuNTUyIDE4LjkzNiAxMTUuNTUyIDE5Ljg5NkMxMTUuNTUyIDIwLjcxNzMgMTE1Ljg0IDIxLjM2OCAxMTYuNDE2IDIxLjg0OEMxMTcuMDAzIDIyLjMxNzMgMTE3Ljc2IDIyLjU1MiAxMTguNjg4IDIyLjU1MloiIGZpbGw9ImJsYWNrIj48L3BhdGg+CjxwYXRoIGQ9Ik05OS45NjczIDI1VjguNTUxOTlIMTAzLjk5OVYxMS42MDhMMTAzLjU1MSAxMS4wOTZIMTA0LjA5NUMxMDQuNDI2IDEwLjE4OTMgMTA1LjAyMyA5LjQ1MzMyIDEwNS44ODcgOC44ODc5OUMxMDYuNzUxIDguMzExOTkgMTA3LjY1OCA4LjAyMzk5IDEwOC42MDcgOC4wMjM5OUMxMDguODk1IDguMDIzOTkgMTA5LjE4OSA4LjA1MDY1IDEwOS40ODcgOC4xMDM5OUMxMDkuNzg2IDguMTQ2NjUgMTEwLjA1OCA4LjIxMDY1IDExMC4zMDMgOC4yOTU5OUMxMTAuNTQ5IDguMzcwNjUgMTEwLjY3MSA4LjQwNzk5IDExMC42NzEgOC40MDc5OVYxMi40NEMxMTAuNjcxIDEyLjQ0IDExMC41MTEgMTIuMzg2NyAxMTAuMTkxIDEyLjI4QzEwOS44NzEgMTIuMTYyNyAxMDkuNTI1IDEyLjA3MiAxMDkuMTUxIDEyLjAwOEMxMDguNzg5IDExLjkzMzMgMTA4LjQ1MyAxMS44OTYgMTA4LjE0MyAxMS44OTZDMTA3LjAyMyAxMS44OTYgMTA2LjA4NSAxMi4zMTIgMTA1LjMyNyAxMy4xNDRDMTA0LjU4MSAxMy45NzYgMTA0LjIwNyAxNS4wMzczIDEwNC4yMDcgMTYuMzI4VjI1SDk5Ljk2NzNaIiBmaWxsPSJibGFjayI+PC9wYXRoPgo8cGF0aCBkPSJNODguNDYwOCAyNVY0LjE2ODAxSDkyLjc4MDhWMjVIODguNDYwOFpNODIuMTI0OCA2LjEwNDAxVjIuMDg4MDFIOTkuMDg0OFY2LjEwNDAxSDgyLjEyNDhaIiBmaWxsPSJibGFjayI+PC9wYXRoPgo8cGF0aCBkPSJNNzQuMzUzNyAyNS41MTJDNzEuODA0NCAyNS41MTIgNjkuNjk3NyAyNC42ODUzIDY4LjAzMzcgMjMuMDMyQzY2LjM2OTcgMjEuMzY4IDY1LjUzNzcgMTkuMjgyNyA2NS41Mzc3IDE2Ljc3NkM2NS41Mzc3IDE0LjIyNjcgNjYuMzY5NyAxMi4xMzA3IDY4LjAzMzcgMTAuNDg4QzY5LjY5NzcgOC44NDUzMiA3MS44MDQ0IDguMDIzOTkgNzQuMzUzNyA4LjAyMzk5Qzc2LjkwMzEgOC4wMjM5OSA3OS4wMDk3IDguODUwNjUgODAuNjczNyAxMC41MDRDODIuMzQ4NCAxMi4xNTczIDgzLjE4NTcgMTQuMjQ4IDgzLjE4NTcgMTYuNzc2QzgzLjE4NTcgMTkuMjgyNyA4Mi4zNTM3IDIxLjM2OCA4MC42ODk3IDIzLjAzMkM3OS4wMjU3IDI0LjY4NTMgNzYuOTEzNyAyNS41MTIgNzQuMzUzNyAyNS41MTJaTTc0LjM2OTcgMjEuODhDNzUuNjgxNyAyMS44OCA3Ni43ODU3IDIxLjQgNzcuNjgxNyAyMC40NEM3OC41ODg0IDE5LjQ4IDc5LjA0MTcgMTguMjU4NyA3OS4wNDE3IDE2Ljc3NkM3OS4wNDE3IDE1LjI2MTMgNzguNTg4NCAxNC4wMzQ3IDc3LjY4MTcgMTMuMDk2Qzc2Ljc3NTEgMTIuMTQ2NyA3NS42NzExIDExLjY3MiA3NC4zNjk3IDExLjY3MkM3My4wMzY0IDExLjY3MiA3MS45MTY0IDEyLjE0NjcgNzEuMDA5NyAxMy4wOTZDNzAuMTEzNyAxNC4wNDUzIDY5LjY2NTcgMTUuMjY2NyA2OS42NjU3IDE2Ljc2QzY5LjY2NTcgMTguMjUzMyA3MC4xMTM3IDE5LjQ4IDcxLjAwOTcgMjAuNDRDNzEuOTA1NyAyMS40IDczLjAyNTcgMjEuODggNzQuMzY5NyAyMS44OFoiIGZpbGw9ImJsYWNrIj48L3BhdGg+CjxwYXRoIGQ9Ik01NS42NDQyIDI1LjUxMkM1My4xMTYyIDI1LjUxMiA1MS4wNTc2IDI0LjY5MDcgNDkuNDY4MiAyMy4wNDhDNDcuODg5NiAyMS40MDUzIDQ3LjEwMDIgMTkuMzA5MyA0Ny4xMDAyIDE2Ljc2QzQ3LjEwMDIgMTQuMjQyNyA0Ny44ODk2IDEyLjE1NzMgNDkuNDY4MiAxMC41MDRDNTEuMDQ2OSA4Ljg1MDY1IDUzLjA2ODIgOC4wMjM5OSA1NS41MzIyIDguMDIzOTlDNTcuOTIxNiA4LjAyMzk5IDU5Ljg3MzYgOC43NjUzMiA2MS4zODgyIDEwLjI0OEM2Mi45MDI5IDExLjcyIDYzLjY2MDIgMTMuNTk3MyA2My42NjAyIDE1Ljg4VjE3LjYwOEg0OS4yMjgyVjE1LjE3Nkg1OS42NjAyQzU5LjU4NTYgMTQuMDg4IDU5LjE4MDIgMTMuMTkyIDU4LjQ0NDIgMTIuNDg4QzU3LjcwODIgMTEuNzg0IDU2LjczNzYgMTEuNDMyIDU1LjUzMjIgMTEuNDMyQzU0LjIzMDkgMTEuNDMyIDUzLjE3NDkgMTEuOTAxMyA1Mi4zNjQyIDEyLjg0QzUxLjU1MzYgMTMuNzc4NyA1MS4xNDgyIDE1LjA1ODcgNTEuMTQ4MiAxNi42OEM1MS4xNDgyIDE4LjM2NTMgNTEuNjA2OSAxOS43MDkzIDUyLjUyNDIgMjAuNzEyQzUzLjQ0MTYgMjEuNzA0IDU0LjYxNDkgMjIuMiA1Ni4wNDQyIDIyLjJDNTYuNzA1NiAyMi4yIDU3LjI4MTYgMjIuMTA5MyA1Ny43NzIyIDIxLjkyOEM1OC4yNzM2IDIxLjc0NjcgNTguNzIxNiAyMS40OTYgNTkuMTE2MiAyMS4xNzZDNTkuNTIxNiAyMC44NTYgNTkuOTgwMiAyMC4zNDkzIDYwLjQ5MjIgMTkuNjU2TDYzLjI0NDIgMjEuNDk2QzYyLjU1MDkgMjIuNTczMyA2MS44NDY5IDIzLjM3ODcgNjEuMTMyMiAyMy45MTJDNjAuNDI4MiAyNC40MzQ3IDU5LjY0NDIgMjQuODI5MyA1OC43ODAyIDI1LjA5NkM1Ny45MjY5IDI1LjM3MzMgNTYuODgxNiAyNS41MTIgNTUuNjQ0MiAyNS41MTJaIiBmaWxsPSJibGFjayI+PC9wYXRoPgo8cGF0aCBkPSJNMzQuMDg4IDI1LjUxMkMzMC43MDY2IDI1LjQ4IDI3Ljg3NDYgMjQuMzIyNyAyNS41OTIgMjIuMDRDMjMuMzIgMTkuNzQ2NyAyMi4xODQgMTYuOTA0IDIyLjE4NCAxMy41MTJDMjIuMTg0IDEwLjA4OCAyMy4zMzA2IDcuMjQ1MzIgMjUuNjI0IDQuOTgzOTlDMjcuOTE3MyAyLjcxMTk5IDMwLjc0OTMgMS41NzU5OSAzNC4xMiAxLjU3NTk5QzM1LjIyOTMgMS41NzU5OSAzNi4yOCAxLjY5MzMyIDM3LjI3MiAxLjkyNzk5QzM4LjI2NCAyLjE2MjY2IDM5LjE2IDIuNDk4NjYgMzkuOTYgMi45MzU5OUM0MC43NiAzLjM3MzMyIDQxLjQyMTMgMy44NDI2NiA0MS45NDQgNC4zNDM5OUM0Mi40NjY2IDQuODQ1MzIgNDIuNzI4IDUuMDk1OTkgNDIuNzI4IDUuMDk1OTlMMzkuODggOC4wNzE5OUMzOS44OCA4LjA3MTk5IDM5LjY4MjYgNy44ODUzMiAzOS4yODggNy41MTE5OUMzOC45MDQgNy4xMjc5OSAzOC40NTYgNi43OTczMiAzNy45NDQgNi41MTk5OUMzNy40MzIgNi4yMzE5OSAzNi44NTYgNi4wMTMzMiAzNi4yMTYgNS44NjM5OUMzNS41ODY2IDUuNzAzOTkgMzQuOTE0NiA1LjYyMzk5IDM0LjIgNS42MjM5OUMzMi4wMDI2IDUuNjIzOTkgMzAuMTYyNiA2LjM1NDY2IDI4LjY4IDcuODE1OTlDMjcuMjA4IDkuMjY2NjYgMjYuNDcyIDExLjE4NjcgMjYuNDcyIDEzLjU3NkMyNi40NzIgMTUuOTQ0IDI3LjIxMzMgMTcuODY5MyAyOC42OTYgMTkuMzUyQzMwLjE3ODYgMjAuODM0NyAzMi4wMjQgMjEuNTc2IDM0LjIzMiAyMS41NzZDMzYuMjU4NiAyMS41NzYgMzcuOTAxMyAyMS4wNTMzIDM5LjE2IDIwLjAwOEM0MC40MTg2IDE4Ljk1MiA0MS4xMzg2IDE3LjUwNjcgNDEuMzIgMTUuNjcyVjE1LjcwNEgzMy45OTJWMTIuMjQ4SDQ1LjQ0OEw0NS40NjQgMTQuMjMyQzQ1LjQ2NCAxNy42MzQ3IDQ0LjQxMzMgMjAuMzY1MyA0Mi4zMTIgMjIuNDI0QzQwLjIxMDYgMjQuNDgyNyAzNy40NjkzIDI1LjUxMiAzNC4wODggMjUuNTEyWiIgZmlsbD0iYmxhY2siPjwvcGF0aD4KPHBhdGggZD0iTTE0IDBMMCAxMS4yOTM0VjE3LjY3NTNMMTQgMjlWMjEuNzQyMkw0LjM4Mjc0IDE0LjYwOTVWMTQuMzkwNUwxNCA3LjMyMDM5VjBaIiBmaWxsPSJibGFjayI+PC9wYXRoPgo8cGF0aCBkPSJNMTcxIDI5TDE4NSAxNy43MDY2VjExLjMyNDdMMTcxIDBWNy4yNTc4MkwxODAuNjE3IDE0LjM5MDVWMTQuNjA5NUwxNzEgMjEuNjc5NlYyOVoiIGZpbGw9ImJsYWNrIj48L3BhdGg+Cjwvc3ZnPg==';

const CHEVRON_SVG = (
  <svg width="11" height="11" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
    <path d="M2 1L8 5L2 9" stroke="var(--text-tertiary)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CHECK_SVG = (
  <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}>
    <path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--band-high-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, turnstileToken }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Something went wrong');
        return;
      }
      const data = (await res.json()) as { auditId: string };
      window.location.href = `/report/${data.auditId}`;
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Google Sans Flex', var(--font-ui)", background: 'var(--bg-canvas)', color: 'var(--text-primary)', minHeight: '100vh' }}>

      {/* ===== NAV ===== */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px clamp(16px, 4vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <img src={LOGO_SVG} alt="Geotrack" style={{ height: 22, width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
            <a href="#methodology" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Methodology</a>
            <a href="#pricing" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Pricing</a>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', padding: 2 }}>
              <button style={{ fontFamily: 'var(--font-ui)', border: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)', cursor: 'pointer' }}>EN</button>
              <button style={{ fontFamily: 'var(--font-ui)', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)', cursor: 'pointer' }}>RO</button>
            </div>
            <a href="#audit-input" style={{ background: 'var(--accent-default)', color: 'var(--text-on-accent)', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 'var(--radius-md)', textDecoration: 'none', whiteSpace: 'nowrap', fontFamily: "'Google Sans Flex', var(--font-ui)" }}>Run free audit</a>
          </div>
        </div>
      </div>

      {/* ===== HERO ===== */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-canvas)', padding: 'clamp(48px, 8vw, 96px) clamp(16px, 4vw, 24px) 100px' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '6px 6px', backgroundPosition: 'center center', opacity: 0.2, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, position: 'relative', width: '100%' }}>
          <div style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-full)', padding: '6px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Google Sans Flex', var(--font-ui)" }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--band-low-strong)', flexShrink: 0 }} />
            Free · No signup · about 2 minutes
          </div>
          <h1 style={{ margin: 0, width: '100%', fontSize: 'clamp(32px, 5.2vw, 56px)', lineHeight: 1.08, fontWeight: 700, letterSpacing: 'var(--tracking-tight)', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: "'Google Sans Flex', var(--font-ui)", fontWeight: 700 }}>Your buyers ask ChatGPT.</span>
            <span style={{ color: 'var(--text-tertiary)', fontFamily: "'Google Sans Flex', var(--font-ui)", fontWeight: 600, fontSize: '85%' }}>Does it recommend you?</span>
          </h1>
          <p style={{ margin: '0 auto', alignSelf: 'center', fontSize: 'clamp(16px, 2vw, 19px)', lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: 640, fontFamily: 'var(--font-ui)', textAlign: 'center' }}>
            Enter your web app URL and get a{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>0–10 AI visibility score</span>
            {' '}with{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>evidence</span>
            {' '}and a{' '}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>fix plan</span>.
          </p>

          <form id="audit-input" onSubmit={handleSubmit} style={{ alignSelf: 'center', width: '100%', maxWidth: 526, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ flex: '1 1 0%', minWidth: 200, height: 48, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '0 14px' }}>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="Enter your web app adress"
                  style={{ flex: '1 1 0%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-primary)', minWidth: 0, height: 42, textAlign: 'left' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                style={{ flexShrink: 0, background: 'var(--accent-default)', color: 'var(--text-on-accent)', border: 'none', fontSize: 14, fontWeight: 600, padding: '0 20px', height: 48, borderRadius: 5, cursor: submitting ? 'not-allowed' : 'pointer', textAlign: 'right', fontFamily: "'Google Sans Flex', var(--font-ui)", opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Checking…' : 'Check my visibility'}
              </button>
            </div>

            <Turnstile
              siteKey={siteKey}
              onSuccess={setTurnstileToken}
              options={{ theme: 'auto', size: 'invisible' }}
              style={{ display: 'none' }}
            />

            {error && (
              <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--severity-critical-fg)', background: 'var(--severity-critical-bg)', border: '1px solid var(--severity-critical-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCategoryOpen(o => !o)}
              style={{ alignSelf: 'center', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4, fontFamily: "'Google Sans Flex', var(--font-ui)" }}
            >
              <svg width="9" height="9" viewBox="0 0 10 10" style={{ transform: categoryOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-standard)' }}>
                <path d="M2 1L8 5L2 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Add category and competitors (optional)
            </button>

            {categoryOpen && (
              <div style={{ padding: '12px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>Category (optional)</label>
                  <input
                    placeholder="e.g. project management software"
                    style={{ height: 38, boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 5, padding: '0 12px', fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>Competitors (optional, comma-separated)</label>
                  <input
                    placeholder="e.g. competitor.com, another.io"
                    style={{ height: 38, boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 5, padding: '0 12px', fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none' }}
                  />
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ===== LIVE EXAMPLE AUDIT CARD ===== */}
      <div style={{ background: 'var(--bg-canvas)', padding: '0 clamp(16px, 4vw, 24px) 64px', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '6px 6px', backgroundPosition: 'center center', opacity: 0.2, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 760, margin: '-36px auto 0', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', textAlign: 'center' }}>Live example from a real audit (with permission)</div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 'clamp(20px, 4vw, 32px)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r="61" fill="none" stroke="var(--border-subtle)" strokeWidth="10" />
                <circle cx="75" cy="75" r="61" fill="none" stroke="var(--band-low-strong)" strokeWidth="10" strokeDasharray="160.975207569941 383.27430373795477" strokeLinecap="round" transform="rotate(-90 75 75)" />
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)" fontWeight="600" fontSize="34" fill="var(--text-primary)">4.2</text>
                <text x="50%" y="66%" textAnchor="middle" fontFamily="var(--font-ui)" fontSize="10" fill="var(--text-tertiary)">/ 10</text>
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--band-low-fg)', fontWeight: 600, fontSize: 13 }}>
                <svg width="10" height="10" viewBox="0 0 12 12"><polygon points="6,1 11,11 1,11" fill="currentColor" /></svg>
                Low visibility
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>acme.io</div>
            </div>
            <div style={{ flex: '1 1 0%', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
              {[
                { label: 'Answer Visibility', value: '2.8', pct: 28, band: 'low' },
                { label: 'AI Crawlability', value: '6.1', pct: 61, band: 'mid' },
                { label: 'Content Citability', value: '3.5', pct: 35, band: 'low' },
                { label: 'Entity & Authority', value: '5.9', pct: 59, band: 'mid' },
                { label: 'Agent-Readiness', value: '2.6', pct: 26, band: 'low' },
              ].map(({ label, value, pct, band }, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: `var(--band-${band}-fg)` }}>{value}</span>
                  </div>
                  <div style={{ position: 'relative', height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: `var(--band-${band}-strong)`, borderRadius: 'var(--radius-full)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== HOW IT WORKS ===== */}
      <div style={{ background: 'var(--bg-canvas)', padding: '64px clamp(16px, 4vw, 24px)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '6px 6px', backgroundPosition: 'center center', opacity: 0.2, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: '0 0 40px', color: 'var(--text-primary)', fontFamily: "'Google Sans Flex', var(--font-ui)" }}>How it works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {[
              { n: '01', title: 'Paste your URL', body: 'No signup, no install. Just the web address you want checked.' },
              { n: '02', title: 'We ask ChatGPT, Perplexity and Gemini', body: '30+ buyer questions in your category, plus a crawl of your site and its machine-readable files.' },
              { n: '03', title: 'You get a score, evidence and fixes', body: 'A 0–10 score, the exact AI answers we saw, and a prioritized list of what to fix first.' },
            ].map(({ n, title, body }) => (
              <div key={n} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)' }}>{n}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Google Sans Flex', var(--font-ui)" }}>{title}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: "'Google Sans Flex', var(--font-ui)" }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== FIVE PILLARS ===== */}
      <div id="methodology" style={{ background: 'color-mix(in srgb, var(--bg-app) 95%, black 5%)', padding: '64px clamp(16px, 4vw, 24px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Five pillars, scored separately</h2>
          <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 40px' }}>Each contributes to your overall score. Nothing here is a black box.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {[
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16v10H9l-4 4V6z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
                title: 'Answer Visibility',
                body: 'Whether AI assistants mention you when buyers ask category questions.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.5" /><circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 17l3-9M16 17l-3-9" stroke="currentColor" strokeWidth="1.5" /></svg>,
                title: 'AI Crawlability',
                body: 'Whether AI crawlers like GPTBot and PerplexityBot can actually reach your pages.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 8c-2 0-3 1.5-3 3.5S5 15 7 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M15 8c-2 0-3 1.5-3 3.5S13 15 15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
                title: 'Content Citability',
                body: 'Whether your content is structured so assistants can quote it accurately.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.5" /></svg>,
                title: 'Entity & Authority',
                body: 'Whether assistants recognize your brand as a distinct, credible entity.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 10l3 2.5-3 2.5M12.5 15h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
                title: 'Agent-Readiness',
                body: 'Whether your site exposes machine-readable info: llms.txt, schema, APIs.',
              },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: 'var(--text-secondary)' }}>{icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== TRUST SIGNALS ===== */}
      <div style={{ background: 'var(--bg-canvas)', padding: '56px clamp(16px, 4vw, 24px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {['Open methodology', 'You see every prompt and answer', 'Engines named, not hidden'].map(label => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {CHECK_SVG}
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== PRICING ===== */}
      <div id="pricing" style={{ background: 'color-mix(in srgb, var(--bg-app) 95%, black 5%)', padding: '64px clamp(16px, 4vw, 24px)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: '0 0 40px', color: 'var(--text-primary)' }}>Pricing</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'stretch' }}>
            {/* Free */}
            <div style={{ position: 'relative', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 24, display: 'flex', flexDirection: 'column', boxShadow: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Snapshot</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, minHeight: 36 }}>One overall score, no breakdown.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>Free</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, flex: '1 1 0%' }}>
                {['0–10 visibility score', '1 domain', 'No card required'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}><path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--band-high-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    {f}
                  </div>
                ))}
              </div>
              <a href="#audit-input" style={{ marginTop: 20, textAlign: 'center', display: 'block', textDecoration: 'none', borderRadius: 'var(--radius-md)', padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>Run free audit</a>
            </div>
            {/* Standard */}
            <div style={{ position: 'relative', border: '1.5px solid var(--accent-default)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 24, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)' }}>
              <span style={{ position: 'absolute', top: -11, left: 24, background: 'var(--accent-default)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>Most popular</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Standard audit</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, minHeight: 36 }}>30 buyer prompts, 3 competitors compared.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>$79</span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>one-time</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, flex: '1 1 0%' }}>
                {['30 prompts across ChatGPT, Perplexity, Gemini', '3 competitors compared', 'Up to 15 findings with fixes', 'PDF report', 'Report within 24 hours.'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}><path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--band-high-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    {f}
                  </div>
                ))}
              </div>
              <a href="#audit-input" style={{ marginTop: 20, textAlign: 'center', display: 'block', textDecoration: 'none', borderRadius: 'var(--radius-md)', padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)', background: 'var(--accent-default)', color: '#fff' }}>Get the Standard audit</a>
            </div>
            {/* Extended */}
            <div style={{ position: 'relative', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', padding: 24, display: 'flex', flexDirection: 'column', boxShadow: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Extended audit</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, minHeight: 36 }}>50 prompts, 5 competitors, priority review.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 16 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>$199</span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>one-time</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, flex: '1 1 0%' }}>
                {['Everything in Standard', '50 prompts, 5 competitors', '15-min walkthrough with the author'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 2 }}><path d="M3 8.5L6.2 11.5L13 4.5" stroke="var(--band-high-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    {f}
                  </div>
                ))}
              </div>
              <a href="#audit-input" style={{ marginTop: 20, textAlign: 'center', display: 'block', textDecoration: 'none', borderRadius: 'var(--radius-md)', padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>Get the Extended audit</a>
            </div>
          </div>
        </div>
      </div>

      {/* ===== COMPETITOR TABLE ===== */}
      <div style={{ background: 'var(--bg-canvas)', padding: '64px clamp(16px, 4vw, 24px)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '6px 6px', backgroundPosition: 'center center', opacity: 0.2, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: '0 0 24px', color: 'var(--text-primary)' }}>You vs competitors</h1>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'auto hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  {['#', 'Brand', 'Mentions', 'Citations', 'Avg position', 'Sentiment'].map((h, i) => (
                    <th key={h} style={{ textAlign: i < 2 ? 'left' : 'center', padding: '12px 16px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: '10', name: 'Acme (you)', init: 'A', bg: 'var(--indigo-600)', pct: 8, citations: '3%', pos: '4.8', sentiment: 'Neutral', highlight: true },
                  { rank: '1', name: 'Toggl', init: 'T', bg: 'var(--slate-600)', pct: 74, citations: '41%', pos: '2.1', sentiment: 'Positive', highlight: false },
                  { rank: '2', name: 'Harvest', init: 'H', bg: 'var(--slate-500)', pct: 58, citations: '31%', pos: '2.6', sentiment: 'Positive', highlight: false },
                  { rank: '5', name: 'Clockify', init: 'C', bg: 'var(--slate-500)', pct: 38, citations: '19%', pos: '3.1', sentiment: 'Neutral', highlight: false },
                  { rank: '7', name: 'Everhour', init: 'E', bg: 'var(--slate-400)', pct: 22, citations: '12%', pos: '3.4', sentiment: 'Neutral', highlight: false },
                ].map(({ rank, name, init, bg, pct, citations, pos, sentiment, highlight }) => (
                  <tr key={name} style={{ background: highlight ? 'var(--accent-subtle-bg)' : undefined }}>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{rank}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: highlight ? 700 : 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: bg, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{init}</span>
                        {name}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-default)', borderRadius: 'var(--radius-full)' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textAlign: 'center' }}>{citations}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textAlign: 'center' }}>{pos}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-tertiary)', fontWeight: 600, textAlign: 'center' }}>{sentiment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== FAQ ===== */}
      <div style={{ background: 'var(--bg-canvas)', padding: '64px clamp(16px, 4vw, 24px)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '6px 6px', backgroundPosition: 'center center', opacity: 0.2, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: '0 0 32px', color: 'var(--text-primary)' }}>Frequently asked questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { q: 'How does Geotrack score visibility?', a: 'We ask ChatGPT, Perplexity and Gemini a set of buyer questions in your category, crawl your site for machine-readability (robots.txt, llms.txt, structured data), and combine both into five pillar scores that average into one 0–10 score.' },
              { q: 'Which AI assistants do you check?', a: 'ChatGPT, Perplexity and Gemini today. We name every engine we query in the report — nothing is checked anonymously or left out of the evidence.' },
              { q: 'Do you store or share our data?', a: 'We store your audit history so you can track score changes over time. We never sell or share your data, and competitor audits only use publicly available information.' },
              { q: 'How is this different from SEO tools?', a: 'SEO tools measure ranking in search results. We measure whether AI assistants can find, crawl and correctly describe you when someone asks a question in chat — a related but separate signal.' },
              { q: 'How often should we re-run the audit?', a: 'Monthly is enough for most teams. Re-run sooner after a site redesign, a migration, or a change to robots.txt.' },
              { q: 'What happens after I pay for the full audit?', a: 'You get the complete report immediately: every finding, the evidence behind it, and a fix plan you can hand to engineering or content. No onboarding call required.' },
            ].map(({ q, a }, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}
                >
                  {q}
                  <svg width="11" height="11" viewBox="0 0 10 10" style={{ transform: faqOpen === i ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms var(--ease-standard)', flexShrink: 0 }}>
                    <path d="M2 1L8 5L2 9" stroke="var(--text-tertiary)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div style={{ maxHeight: faqOpen === i ? 500 : 0, overflow: 'hidden', transition: 'max-height 200ms var(--ease-standard)' }}>
                  <div style={{ padding: '0 4px 18px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px clamp(16px, 4vw, 24px) 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <img src={LOGO_SVG} alt="Geotrack" style={{ height: 22, width: 'auto', alignSelf: 'flex-start' }} />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 260 }}>See what ChatGPT, Perplexity and Gemini tell your buyers about you.</div>
          </div>
          <div className="gt-ftr-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 24 }}>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gt-ftr-heading" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Product</div>
              <a href="#methodology" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Methodology</a>
              <a href="#pricing" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Pricing</a>
              <a href="#" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Sample report</a>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gt-ftr-heading" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Company</div>
              <a href="#" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>About</a>
              <a href="#" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Contact</a>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gt-ftr-heading" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Legal</div>
              <a href="#" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy Policy</a>
              <a href="#" className="gt-link" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms of Service</a>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gt-ftr-heading" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Language</div>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', padding: 2, width: 'fit-content' }}>
                <span style={{ fontFamily: 'var(--font-ui)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>EN</span>
                <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-full)' }}>RO</span>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>© 2026 Geotrack</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <a href="#" aria-label="LinkedIn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="0.5" y="4.2" width="2.4" height="9" fill="currentColor" />
                  <circle cx="1.7" cy="1.4" r="1.4" fill="currentColor" />
                  <path d="M5.4 4.2H7.7V5.6C8.2 4.7 9.2 4 10.6 4C13 4 13.5 5.5 13.5 7.6V13.2H11.1V8.1C11.1 6.9 10.9 6 9.7 6C8.5 6 8.3 6.9 8.3 8.1V13.2H5.9V4.2H5.4Z" fill="currentColor" />
                </svg>
              </a>
              <a href="#" aria-label="X" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 14 14">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

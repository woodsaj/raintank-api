define(['settings'],
function (Settings) {
  "use strict";

  return new Settings({
    datasources: %datasources%,

    search: {
      max_results: 20
    },

    // default start dashboard
    default_route: '/dashboard/service',

    // set to false to disable unsaved changes warning
    unsaved_changes_warning: false,

    // set the default timespan for the playlist feature
    // Example: "1m", "1h"
    playlist_timespan: "1m",

    // If you want to specify password before saving, please specify it bellow
    // The purpose of this password is not security, but to stop some users from accidentally changing dashboards
    admin: {
      password: ''
    },

    // Add your own custom pannels
    plugins: {
      dependencies: ['raintank/all'],
      panels: {
        'raintankServiceDescription': { path: '../plugins/raintank/panels/raintankServiceDescription' },
        'raintankContinuousQueryList': { path: '../plugins/raintank/panels/raintankContinuousQueryList' },
        'raintankServiceList': { path: '../plugins/raintank/panels/raintankServiceList' },
        'raintankServiceEventsPanel': { path: '../plugins/raintank/panels/raintankServiceEventsPanel' },
        'raintankServiceDashboardBuilder': { path: '../plugins/raintank/panels/raintankServiceDashboardBuilder' },
        'raintankMetricEventsPanel': { path: '../plugins/raintank/panels/raintankMetricEventsPanel' },
      },
    }

  });
});
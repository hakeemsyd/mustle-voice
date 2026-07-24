const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FLAGS = ['"-Xfrontend"', '"-disable-autolink-framework"', '"-Xfrontend"', '"SwiftUICore"'];

function withAppTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const entry = configurations[key];
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;

      const settings = entry.buildSettings;
      let flags = settings.OTHER_SWIFT_FLAGS;
      if (flags === undefined) flags = ['"$(inherited)"'];
      if (!Array.isArray(flags)) flags = [flags];
      if (!flags.some((f) => typeof f === 'string' && f.includes('SwiftUICore'))) {
        settings.OTHER_SWIFT_FLAGS = flags.concat(SWIFT_FLAGS);
      }
    }

    return cfg;
  });
}

function withPods(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      const marker = 'swiftuicore-autolink-fix';

      if (!contents.includes(marker)) {
        const snippet = [
          '',
          `    # ${marker}`,
          '    installer.pods_project.targets.each do |t|',
          '      t.build_configurations.each do |c|',
          "        f = c.build_settings['OTHER_SWIFT_FLAGS'] || '$(inherited)'",
          "        f = f.join(' ') if f.is_a?(Array)",
          "        unless f.include?('SwiftUICore')",
          "          c.build_settings['OTHER_SWIFT_FLAGS'] = f + ' -Xfrontend -disable-autolink-framework -Xfrontend SwiftUICore'",
          '        end',
          '      end',
          '    end',
          '',
        ].join('\n');
        contents = contents.replace(
          /post_install do \|installer\|\n/,
          (match) => match + snippet + '\n',
        );
        fs.writeFileSync(podfile, contents);
      }

      return cfg;
    },
  ]);
}

module.exports = function withSwiftUICoreLinkFix(config) {
  config = withAppTarget(config);
  config = withPods(config);
  return config;
};

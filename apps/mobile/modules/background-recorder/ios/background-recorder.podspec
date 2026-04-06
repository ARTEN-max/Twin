require 'json'

package = JSON.parse(File.read(File.join(File.dirname(__dir__), 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'background-recorder'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license'] || 'MIT'
  s.homepage       = 'https://github.com/twin-ai'
  s.authors        = 'Twin'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.4'
  s.source         = { git: '' }

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{swift,h,m}'

  s.frameworks = ['AVFoundation']
end

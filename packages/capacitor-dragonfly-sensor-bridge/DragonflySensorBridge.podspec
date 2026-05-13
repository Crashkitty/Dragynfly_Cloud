Pod::Spec.new do |s|
  s.name             = 'DragonflySensorBridge'
  s.version          = '0.1.0'
  s.summary          = 'Capacitor plugin satisfying the BridgeAdapter contract from apps/patient-pwa.'
  s.license          = { :type => 'PROPRIETARY', :text => 'Internal — Dragonfly Cloud' }
  s.homepage         = 'https://dragonfly.example.com'
  s.author           = 'Dragonfly Cloud'
  s.source           = { :git => 'https://example.invalid/dragonfly.git', :tag => s.version.to_s }
  s.source_files     = 'ios/Plugin/**/*.{swift,h,m}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version    = '5.5'
end

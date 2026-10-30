{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "addon.cc",
        "minkowski.cc"
      ],
      "include_dirs": [
        "/tmp/deepnest-build-deps/node_modules/nan",
        "/usr/include"
      ],
      "cflags_cc": [
        "-std=c++17"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
            }
          }
        ]
      ],
      "libraries!": [
        "-lnode"
      ]
    }
  ]
}

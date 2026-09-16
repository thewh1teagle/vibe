cmake_minimum_required(VERSION 3.20)
project(vibe-funasr-workers LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
if(MSVC)
    add_compile_definitions(NOMINMAX _USE_MATH_DEFINES)
endif()
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_CPU ON CACHE BOOL "" FORCE)
foreach(option METAL CUDA VULKAN HIP MUSA SYCL OPENCL RPC WEBGPU ZDNN
               HEXAGON OPENVINO VIRTGPU VIRTGPU_BACKEND ET ET_SYSEMU ZENDNN
               BLAS NATIVE BACKEND_DL)
    set(GGML_${option} OFF CACHE BOOL "" FORCE)
endforeach()

# GPU acceleration follows the platform choice the prebuilt ggml libs make
# (server/libs/libs.chore): Metal with the metallib embedded in the static
# library on Apple, Vulkan with a runtime-loaded loader everywhere else, so a
# machine without a driver still runs on the CPU. -DFUNASR_GPU=OFF restores
# the CPU-only build.
option(FUNASR_GPU "Build the workers with the platform GPU backend" ON)
if(FUNASR_GPU)
    if(APPLE)
        set(GGML_METAL ON CACHE BOOL "" FORCE)
        set(GGML_METAL_EMBED_LIBRARY ON CACHE BOOL "" FORCE)
    else()
        set(GGML_VULKAN ON CACHE BOOL "" FORCE)
        set(GGML_VULKAN_DYNAMIC_LOADER ON CACHE BOOL "" FORCE)
    endif()
endif()

include(FetchContent)
if(POLICY CMP0169)
    cmake_policy(SET CMP0169 OLD)
endif()
set(FUNASR_SOURCE_DIR "" CACHE PATH "FunASR a57c05bfe2a91b5e0cb0983479634eba3e28ede5 source root")
if(NOT FUNASR_SOURCE_DIR)
    FetchContent_Declare(funasr
        GIT_REPOSITORY https://github.com/modelscope/FunASR.git
        GIT_TAG a57c05bfe2a91b5e0cb0983479634eba3e28ede5
        GIT_SUBMODULES "")
    FetchContent_GetProperties(funasr)
    if(NOT funasr_POPULATED)
        FetchContent_Populate(funasr)
    endif()
    set(FUNASR_SOURCE_DIR "${funasr_SOURCE_DIR}")
endif()
set(FUNASR_RUNTIME "${FUNASR_SOURCE_DIR}/runtime/llama.cpp")

function(checked_source path expected)
    if(NOT EXISTS "${path}")
        message(FATAL_ERROR "Missing pinned FunASR source: ${path}")
    endif()
    file(SHA256 "${path}" actual)
    if(NOT actual STREQUAL expected)
        message(FATAL_ERROR "Pinned FunASR SHA256 mismatch: ${path} (${actual})")
    endif()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${path}")
endfunction()

function(extract_engine source name sha256)
    checked_source("${source}" "${sha256}")
    file(READ "${source}" content)
    string(FIND "${content}" "\nint main(" main_offset)
    if(main_offset LESS 0)
        message(FATAL_ERROR "Cannot find main boundary in ${source}")
    endif()
    string(SUBSTRING "${content}" 0 ${main_offset} helpers)
    file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/${name}-engine.inc" "${helpers}\n")
endfunction()

checked_source("${FUNASR_RUNTIME}/CMakeLists.txt"
    bd8ae233c5331069525646ff2bfcca7effb3b6b16fecc2349c0dc665237ea1cf)
extract_engine("${FUNASR_RUNTIME}/fun-asr-nano/funasr-cli/funasr-cli.cpp" nano
    deb46d00126c0853c4690658e072a3a6d01f29c94f9bbf1c94143b86a7a7c925)
extract_engine("${FUNASR_RUNTIME}/sensevoice/funasr-sensevoice/funasr-sensevoice.cpp" sensevoice
    0f6c84e54229733098e4519f9776f43b285b09fdbf0f60aef2b64ce40fcf558f)

add_subdirectory("${FUNASR_RUNTIME}" "${CMAKE_CURRENT_BINARY_DIR}/upstream" EXCLUDE_FROM_ALL)
FetchContent_GetProperties(llama)
if(NOT EXISTS "${llama_SOURCE_DIR}/vendor/nlohmann/json.hpp")
    message(FATAL_ERROR "Pinned llama.cpp vendor/nlohmann/json.hpp is required")
endif()
find_package(Threads REQUIRED)
foreach(engine nano sensevoice)
    if(engine STREQUAL "nano")
        set(worker vibe-funasr-nano-worker)
    else()
        set(worker vibe-sensevoice-worker)
    endif()
    add_executable(${worker} "${engine}.cpp")
    target_include_directories(${worker} PRIVATE
        "${CMAKE_CURRENT_BINARY_DIR}"
        "${FUNASR_RUNTIME}/funasr-common"
        "${llama_SOURCE_DIR}/vendor")
    target_link_libraries(${worker} PRIVATE ggml Threads::Threads)
    if(engine STREQUAL "nano")
        target_link_libraries(${worker} PRIVATE llama)
    endif()
    install(TARGETS ${worker} RUNTIME DESTINATION bin)
endforeach()

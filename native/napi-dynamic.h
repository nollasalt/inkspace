#pragma once
#include <node_api.h>
#include <windows.h>
struct NapiApi {
 decltype(&napi_get_cb_info) get_cb_info;
 decltype(&napi_get_named_property) get_named_property;
 decltype(&napi_get_value_double) get_value_double;
 decltype(&napi_get_value_bool) get_value_bool;
 decltype(&napi_get_typedarray_info) get_typedarray_info;
 decltype(&napi_get_buffer_info) get_buffer_info;
 decltype(&napi_create_object) create_object;
 decltype(&napi_create_array_with_length) create_array_with_length;
 decltype(&napi_create_double) create_double;
 decltype(&napi_create_uint32) create_uint32;
 decltype(&napi_create_string_utf8) create_string_utf8;
 decltype(&napi_create_buffer_copy) create_buffer_copy;
 decltype(&napi_set_named_property) set_named_property;
 decltype(&napi_set_element) set_element;
 decltype(&napi_get_undefined) get_undefined;
 decltype(&napi_create_function) create_function;
 decltype(&napi_throw_error) throw_error;
 decltype(&napi_add_env_cleanup_hook) add_env_cleanup_hook;
} api;
inline bool loadNapi(){
 auto exe=GetModuleHandleW(nullptr);
 api.get_cb_info=reinterpret_cast<decltype(api.get_cb_info)>(GetProcAddress(exe,"napi_get_cb_info"));if(!api.get_cb_info)return false;
 api.get_named_property=reinterpret_cast<decltype(api.get_named_property)>(GetProcAddress(exe,"napi_get_named_property"));if(!api.get_named_property)return false;
 api.get_value_double=reinterpret_cast<decltype(api.get_value_double)>(GetProcAddress(exe,"napi_get_value_double"));if(!api.get_value_double)return false;
 api.get_value_bool=reinterpret_cast<decltype(api.get_value_bool)>(GetProcAddress(exe,"napi_get_value_bool"));if(!api.get_value_bool)return false;
 api.get_typedarray_info=reinterpret_cast<decltype(api.get_typedarray_info)>(GetProcAddress(exe,"napi_get_typedarray_info"));if(!api.get_typedarray_info)return false;
 api.get_buffer_info=reinterpret_cast<decltype(api.get_buffer_info)>(GetProcAddress(exe,"napi_get_buffer_info"));if(!api.get_buffer_info)return false;
 api.create_object=reinterpret_cast<decltype(api.create_object)>(GetProcAddress(exe,"napi_create_object"));if(!api.create_object)return false;
 api.create_array_with_length=reinterpret_cast<decltype(api.create_array_with_length)>(GetProcAddress(exe,"napi_create_array_with_length"));if(!api.create_array_with_length)return false;
 api.create_double=reinterpret_cast<decltype(api.create_double)>(GetProcAddress(exe,"napi_create_double"));if(!api.create_double)return false;
 api.create_uint32=reinterpret_cast<decltype(api.create_uint32)>(GetProcAddress(exe,"napi_create_uint32"));if(!api.create_uint32)return false;
 api.create_string_utf8=reinterpret_cast<decltype(api.create_string_utf8)>(GetProcAddress(exe,"napi_create_string_utf8"));if(!api.create_string_utf8)return false;
 api.create_buffer_copy=reinterpret_cast<decltype(api.create_buffer_copy)>(GetProcAddress(exe,"napi_create_buffer_copy"));if(!api.create_buffer_copy)return false;
 api.set_named_property=reinterpret_cast<decltype(api.set_named_property)>(GetProcAddress(exe,"napi_set_named_property"));if(!api.set_named_property)return false;
 api.set_element=reinterpret_cast<decltype(api.set_element)>(GetProcAddress(exe,"napi_set_element"));if(!api.set_element)return false;
 api.get_undefined=reinterpret_cast<decltype(api.get_undefined)>(GetProcAddress(exe,"napi_get_undefined"));if(!api.get_undefined)return false;
 api.create_function=reinterpret_cast<decltype(api.create_function)>(GetProcAddress(exe,"napi_create_function"));if(!api.create_function)return false;
 api.throw_error=reinterpret_cast<decltype(api.throw_error)>(GetProcAddress(exe,"napi_throw_error"));if(!api.throw_error)return false;
 api.add_env_cleanup_hook=reinterpret_cast<decltype(api.add_env_cleanup_hook)>(GetProcAddress(exe,"napi_add_env_cleanup_hook"));if(!api.add_env_cleanup_hook)return false;
 return true;
}
#define napi_get_cb_info api.get_cb_info
#define napi_get_named_property api.get_named_property
#define napi_get_value_double api.get_value_double
#define napi_get_value_bool api.get_value_bool
#define napi_get_typedarray_info api.get_typedarray_info
#define napi_get_buffer_info api.get_buffer_info
#define napi_create_object api.create_object
#define napi_create_array_with_length api.create_array_with_length
#define napi_create_double api.create_double
#define napi_create_uint32 api.create_uint32
#define napi_create_string_utf8 api.create_string_utf8
#define napi_create_buffer_copy api.create_buffer_copy
#define napi_set_named_property api.set_named_property
#define napi_set_element api.set_element
#define napi_get_undefined api.get_undefined
#define napi_create_function api.create_function
#define napi_throw_error api.throw_error
#define napi_add_env_cleanup_hook api.add_env_cleanup_hook

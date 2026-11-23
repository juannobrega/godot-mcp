#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Every complex Godot operation the MCP server performs runs through this one
# script. It is invoked as:
#
#   godot --headless --path <project> --script godot_operations.gd <operation> <json_params>
#
# Keeping it to a single bundled script means no temporary file is written per
# call, and the server only has to validate one argument vocabulary.
#
# Two things about SceneTree shape the control flow here:
#
#   1. quit() only schedules the exit for the next idle frame. It does not
#      return from the running function, so a failure must set `exit_code` and
#      then `return` — otherwise execution carries on with invalid state.
#   2. _init() must reach a quit() call, or the tree keeps running forever.
#
# Hence the `fail()` helper: it records the failure, and every caller returns
# immediately after calling it.

var debug_mode := false
var exit_code := 0


func _init():
	var args = OS.get_cmdline_args()
	debug_mode = "--debug-godot" in args

	var script_index = args.find("--script")
	if script_index == -1:
		fail("Could not find the --script argument")
		quit(exit_code)
		return

	# Layout: --script <script path> <operation> <json params>
	var operation_index = script_index + 2
	var params_index = script_index + 3

	if args.size() <= params_index:
		fail("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
		quit(exit_code)
		return

	log_debug("Arguments: " + str(args))

	var operation = args[operation_index]
	var params = parse_params(args[params_index])
	if params == null:
		quit(exit_code)
		return

	log_info("Operation: " + operation)

	match operation:
		"create_scene":
			create_scene(params)
		"add_node":
			add_node(params)
		"load_sprite":
			load_sprite(params)
		"export_mesh_library":
			export_mesh_library(params)
		"save_scene":
			save_scene(params)
		"get_uid":
			get_uid(params)
		"resave_resources":
			resave_resources(params)
		_:
			fail("Unknown operation: " + operation)

	quit(exit_code)


# ---------------------------------------------------------------- logging ----

func log_debug(message: String) -> void:
	if debug_mode:
		print("[DEBUG] " + message)


func log_info(message: String) -> void:
	print("[INFO] " + message)


func log_error(message: String) -> void:
	printerr("[ERROR] " + message)


# Record a failure so the process exits non-zero.
#
# The caller MUST return immediately after calling this. See the note at the
# top: quit() does not abort the running function.
func fail(message: String) -> void:
	log_error(message)
	exit_code = 1


# ------------------------------------------------------------- parameters ----

func parse_params(raw: String):
	var json = JSON.new()

	if json.parse(raw) != OK:
		fail("Invalid JSON parameters: " + json.get_error_message() + " at line " + str(json.get_error_line()))
		return null

	var data = json.get_data()

	# Checked by type rather than truthiness: an empty Dictionary is falsy in
	# GDScript, which used to make any parameterless operation impossible.
	if typeof(data) != TYPE_DICTIONARY:
		fail("Expected a JSON object for parameters, got: " + raw)
		return null

	log_debug("Params: " + raw)
	return data


# Report a missing required parameter, returning whether all are present.
func require_params(params: Dictionary, names: Array) -> bool:
	for name in names:
		if not params.has(name):
			fail("Missing required parameter: " + str(name))
			return false
	return true


# ------------------------------------------------------------------ paths ----

# Normalize a project-relative path into a res:// path.
func res_path(path: String) -> String:
	return path if path.begins_with("res://") else "res://" + path


# Create the directory a resource is about to be written into.
func ensure_directory_for(resource_path: String) -> bool:
	var directory = resource_path.get_base_dir()
	if directory == "" or directory == "res://" or directory == "res:/":
		return true

	var absolute = ProjectSettings.globalize_path(directory)
	if DirAccess.dir_exists_absolute(absolute):
		return true

	log_debug("Creating directory: " + directory)
	var error = DirAccess.make_dir_recursive_absolute(absolute)
	if error != OK:
		fail("Could not create directory " + directory + " (error " + str(error) + ")")
		return false

	return true


func describe_save_error(error: int) -> String:
	match error:
		ERR_CANT_CREATE:
			return "cannot create the file (ERR_CANT_CREATE)"
		ERR_CANT_OPEN:
			return "cannot open the file for writing (ERR_CANT_OPEN)"
		ERR_FILE_CANT_WRITE:
			return "cannot write to the file (ERR_FILE_CANT_WRITE)"
		ERR_FILE_NO_PERMISSION:
			return "no permission to write the file (ERR_FILE_NO_PERMISSION)"
		_:
			return "error " + str(error)


# ------------------------------------------------------------ class lookup ----

# Look up a script by registered class name.
#
# Only the project's global class registry is consulted. Raw paths such as
# "res://evil.gd" are deliberately not accepted: the class name arrives from an
# agent, and resolving it as a path would allow instantiating any script in the
# project.
func get_script_by_name(name_of_class: String):
	var global_classes = ProjectSettings.get_global_class_list()
	log_debug("Searching " + str(global_classes.size()) + " registered classes for " + name_of_class)

	for global_class in global_classes:
		if global_class["class"] != name_of_class:
			continue

		var script = load(global_class["path"]) as Script
		if script == null:
			fail("Class " + name_of_class + " is registered at " + global_class["path"] + " but could not be loaded")
			return null

		log_debug("Loaded " + name_of_class + " from " + global_class["path"])
		return script

	fail("Unknown class: " + name_of_class + " (not in ClassDB and not a registered global class)")
	return null


# Instantiate a built-in class, or a script registered under a global class name.
func instantiate_class(name_of_class: String):
	if name_of_class.is_empty():
		fail("Cannot instantiate a class with an empty name")
		return null

	if ClassDB.class_exists(name_of_class):
		if not ClassDB.can_instantiate(name_of_class):
			fail("Class " + name_of_class + " exists but cannot be instantiated (it may be abstract)")
			return null

		var instance = ClassDB.instantiate(name_of_class)
		if instance == null:
			fail("ClassDB could not instantiate " + name_of_class)
			return null

		log_debug("Instantiated built-in class " + name_of_class)
		return instance

	var script = get_script_by_name(name_of_class)
	if script == null:
		# get_script_by_name already reported why
		return null

	if not (script is GDScript):
		fail("Class " + name_of_class + " resolves to a script that is not GDScript")
		return null

	return script.new()


# ------------------------------------------------------------------ scenes ----

# Load a scene and return its instantiated root, or null on failure.
func instantiate_scene(scene_path: String):
	if not FileAccess.file_exists(scene_path):
		fail("Scene does not exist: " + scene_path)
		return null

	var scene = load(scene_path)
	if scene == null:
		fail("Could not load scene: " + scene_path)
		return null

	return scene.instantiate()


# Pack a node tree and write it, reporting whichever step fails.
func save_packed_scene(root: Node, target_path: String) -> bool:
	var packed = PackedScene.new()

	var pack_error = packed.pack(root)
	if pack_error != OK:
		fail("Could not pack scene for " + target_path + " (error " + str(pack_error) + ")")
		return false

	if not ensure_directory_for(target_path):
		return false

	var save_error = ResourceSaver.save(packed, target_path)
	if save_error != OK:
		fail("Could not save scene to " + target_path + ": " + describe_save_error(save_error))
		return false

	# ResourceSaver can report success for a write that did not land
	if not FileAccess.file_exists(target_path):
		fail("Save reported success but " + target_path + " does not exist")
		return false

	return true


func create_scene(params: Dictionary) -> void:
	if not require_params(params, ["scene_path"]):
		return

	var scene_path = res_path(params.scene_path)
	var root_node_type = params.get("root_node_type", "Node2D")
	log_info("Creating scene " + scene_path + " with root node type " + root_node_type)

	var root = instantiate_class(root_node_type)
	if root == null:
		return

	root.name = "root"
	root.owner = root

	if save_packed_scene(root, scene_path):
		log_info("Scene created at " + scene_path)


func add_node(params: Dictionary) -> void:
	if not require_params(params, ["scene_path", "node_type", "node_name"]):
		return

	var scene_path = res_path(params.scene_path)
	log_info("Adding " + params.node_type + " '" + params.node_name + "' to " + scene_path)

	var root = instantiate_scene(scene_path)
	if root == null:
		return

	var parent_path = params.get("parent_node_path", "root")
	var parent = root

	if parent_path != "root":
		# Paths are expressed from "root", which is this scene's own root node
		var relative = parent_path.trim_prefix("root/")
		# get_node_or_null rather than get_node: a missing node is a reportable
		# condition here, not an engine-level error
		parent = root.get_node_or_null(relative)
		if parent == null:
			fail("Parent node not found: " + parent_path)
			return

	var node = instantiate_class(params.node_type)
	if node == null:
		return

	node.name = params.node_name

	if params.has("properties"):
		if not apply_properties(node, params.properties):
			return

	parent.add_child(node)
	node.owner = root

	if save_packed_scene(root, scene_path):
		log_info("Node '" + params.node_name + "' added to " + scene_path)


# Set caller-supplied properties on a node.
#
# Property names and values are the caller's own vocabulary and are passed
# through untouched; only a res:// string is interpreted, as a resource to load.
func apply_properties(node: Node, properties: Dictionary) -> bool:
	for property in properties:
		var value = properties[property]

		if typeof(value) == TYPE_STRING and value.begins_with("res://"):
			var resource = load(value)
			if resource == null:
				fail("Could not load resource for property " + str(property) + ": " + value)
				return false
			value = resource

		log_debug("Setting " + str(property) + " = " + str(value))
		node.set(property, value)

	return true


func save_scene(params: Dictionary) -> void:
	if not require_params(params, ["scene_path"]):
		return

	var scene_path = res_path(params.scene_path)
	var target_path = res_path(params.new_path) if params.has("new_path") else scene_path
	log_info("Saving " + scene_path + " to " + target_path)

	var root = instantiate_scene(scene_path)
	if root == null:
		return

	if save_packed_scene(root, target_path):
		log_info("Scene saved to " + target_path)


func load_sprite(params: Dictionary) -> void:
	if not require_params(params, ["scene_path", "node_path", "texture_path"]):
		return

	var scene_path = res_path(params.scene_path)
	var texture_path = res_path(params.texture_path)
	log_info("Setting texture " + texture_path + " on " + params.node_path)

	var root = instantiate_scene(scene_path)
	if root == null:
		return

	var node_path = params.node_path.trim_prefix("root/")
	var node = root if node_path == "" or node_path == "root" else root.get_node_or_null(node_path)

	if node == null:
		fail("Node not found: " + params.node_path)
		return

	if not (node is Sprite2D or node is Sprite3D or node is TextureRect):
		fail("Node " + params.node_path + " is a " + node.get_class() + ", which cannot hold a texture (expected Sprite2D, Sprite3D or TextureRect)")
		return

	var texture = load(texture_path)
	if texture == null:
		# Almost always an un-imported file: Godot resolves textures through
		# the import system, which only runs in the editor.
		fail("Could not load texture " + texture_path + ". If the file was just added, Godot has not imported it yet — run `godot --headless --path <project> --import` first")
		return

	node.texture = texture

	if save_packed_scene(root, scene_path):
		log_info("Texture " + texture_path + " set on " + params.node_path)


# ------------------------------------------------------------ mesh library ----

func export_mesh_library(params: Dictionary) -> void:
	if not require_params(params, ["scene_path", "output_path"]):
		return

	var scene_path = res_path(params.scene_path)
	var output_path = res_path(params.output_path)
	log_info("Exporting MeshLibrary from " + scene_path + " to " + output_path)

	var root = instantiate_scene(scene_path)
	if root == null:
		return

	var wanted_items = params.get("mesh_item_names", [])
	var filtering = wanted_items.size() > 0
	var library = MeshLibrary.new()
	var item_id = 0

	for child in root.get_children():
		if filtering and not (child.name in wanted_items):
			log_debug("Skipping " + child.name + ": not in mesh_item_names")
			continue

		var mesh_instance = find_mesh_instance(child)
		if mesh_instance == null or mesh_instance.mesh == null:
			log_debug("Skipping " + child.name + ": no mesh")
			continue

		library.create_item(item_id)
		library.set_item_name(item_id, child.name)
		library.set_item_mesh(item_id, mesh_instance.mesh)
		library.set_item_preview(item_id, mesh_instance.mesh)

		var shape = find_collision_shape(child)
		if shape != null:
			library.set_item_shapes(item_id, [shape])

		log_debug("Added " + child.name + " as item " + str(item_id))
		item_id += 1

	# Previously this printed a message and exited zero, so the server reported
	# a successful export that had written nothing.
	if item_id == 0:
		fail("No meshes found in " + scene_path + ". A MeshLibrary needs MeshInstance3D nodes with meshes assigned.")
		return

	if not ensure_directory_for(output_path):
		return

	var error = ResourceSaver.save(library, output_path)
	if error != OK:
		fail("Could not save MeshLibrary to " + output_path + ": " + describe_save_error(error))
		return

	if not FileAccess.file_exists(output_path):
		fail("Save reported success but " + output_path + " does not exist")
		return

	log_info("MeshLibrary exported with " + str(item_id) + " items to " + output_path)


# A node's own mesh, or the first one among its direct children.
func find_mesh_instance(node: Node):
	if node is MeshInstance3D:
		return node

	for child in node.get_children():
		if child is MeshInstance3D:
			return child

	return null


func find_collision_shape(node: Node):
	for child in node.get_children():
		if child is CollisionShape3D and child.shape != null:
			return child.shape

	return null


# -------------------------------------------------------------------- UIDs ----

func get_uid(params: Dictionary) -> void:
	if not require_params(params, ["file_path"]):
		return

	var file_path = res_path(params.file_path)
	log_info("Reading UID for " + file_path)

	if not FileAccess.file_exists(file_path):
		fail("File does not exist: " + file_path)
		return

	var uid_path = file_path + ".uid"
	var handle = FileAccess.open(uid_path, FileAccess.READ)

	var result = {
		"file": file_path,
		"absolutePath": ProjectSettings.globalize_path(file_path),
	}

	if handle != null:
		result["uid"] = handle.get_as_text().strip_edges()
		result["exists"] = true
		handle.close()
	else:
		result["exists"] = false
		result["message"] = "No UID file for this resource. Run update_project_uids to generate one."

	# The server reads the last JSON object printed, so this stays on one line
	print(JSON.stringify(result))


func resave_resources(_params: Dictionary) -> void:
	# No path parameter: --path already points Godot at the project, so
	# everything resolves from res://. A host path passed here used to be
	# prefixed with res:// and matched nothing while reporting success.
	log_info("Resaving project resources to refresh UID references")

	var scenes = find_files("res://", ".tscn")
	log_debug("Found " + str(scenes.size()) + " scenes")

	var saved = 0
	var failures: Array = []

	for scene_path in scenes:
		var scene = load(scene_path)
		if scene == null:
			failures.append(scene_path + " (could not load)")
			continue

		var error = ResourceSaver.save(scene, scene_path)
		if error == OK:
			saved += 1
		else:
			failures.append(scene_path + " (" + describe_save_error(error) + ")")

	var scripts = find_files("res://", ".gd") + find_files("res://", ".shader") + find_files("res://", ".gdshader")
	log_debug("Found " + str(scripts.size()) + " scripts and shaders")

	var generated = 0

	for script_path in scripts:
		if FileAccess.file_exists(script_path + ".uid"):
			continue

		var resource = load(script_path)
		if resource == null:
			failures.append(script_path + " (could not load)")
			continue

		# Re-saving is what makes Godot mint the UID
		var error = ResourceSaver.save(resource, script_path)
		if error == OK:
			generated += 1
		else:
			failures.append(script_path + " (" + describe_save_error(error) + ")")

	log_info("Resaved " + str(saved) + " of " + str(scenes.size()) + " scenes, generated " + str(generated) + " UIDs")

	if failures.size() > 0:
		fail("Could not resave " + str(failures.size()) + " resource(s): " + ", ".join(failures))
		return

	log_info("Resave complete")


# Collect files with an extension, recursively, under a res:// directory.
func find_files(path: String, extension: String) -> Array:
	var files: Array = []
	var dir = DirAccess.open(path)

	if dir == null:
		log_debug("Could not open " + path + ": " + str(DirAccess.get_open_error()))
		return files

	var base = path if path.ends_with("/") else path + "/"

	dir.list_dir_begin()
	var entry = dir.get_next()

	while entry != "":
		if dir.current_is_dir():
			# Skip hidden directories, which includes Godot's own .godot cache
			if not entry.begins_with("."):
				files.append_array(find_files(base + entry + "/", extension))
		elif entry.ends_with(extension):
			files.append(base + entry)

		entry = dir.get_next()

	dir.list_dir_end()
	return files

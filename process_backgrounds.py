import os
from PIL import Image

input_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\advirus-evolution\background digimon"
output_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\advirus-evolution\public\assets\backgrounds"

mapping = {
    "City_inside_motherboard_da1aa4fc20.jpeg": "bg_circuit_city.png",
    "Clockwork_void_floating_gears_c3b8caa3d2.jpeg": "bg_clockwork_void.png",
    "Cyberpunk_neon_forest_night_29fea6a4dc.jpeg": "bg_neon_forest.png",
    "Data_cathedral_interior_hightech_103e4d9831.jpeg": "bg_data_cathedral.png",
    "Glitch_desert_shifting_sand_dunes_2b32b8e8d0.jpeg": "bg_glitch_desert.png",
    "Space_station_docking_bay_planet_be23bf7a31.jpeg": "bg_space_hub.png",
    "Toxic_marshland_neon_green_sludge_601a398cb7.jpeg": "bg_toxic_marsh.png",
    "Virtual_library_floating_books_54da5a2c75.jpeg": "bg_virtual_library.png",
    "____traitid_bg_cyber_graveyard____name_cyber_grave_bd97b4c0c9.jpeg": "bg_cyber_graveyard.png",
    "____traitid_bg_storm_clouds____name_storm_clouds___3066f32927.jpeg": "bg_storm_clouds.png"
}

os.makedirs(output_dir, exist_ok=True)

for old_name, new_name in mapping.items():
    old_path = os.path.join(input_dir, old_name)
    new_path = os.path.join(output_dir, new_name)
    
    if os.path.exists(old_path):
        print(f"Processing {old_name} -> {new_name}")
        try:
            with Image.open(old_path) as img:
                img.save(new_path, "PNG")
                print(f"Successfully saved {new_name}")
        except Exception as e:
            print(f"Error processing {old_name}: {e}")
    else:
        print(f"File not found: {old_path}")

print("Processing complete!")

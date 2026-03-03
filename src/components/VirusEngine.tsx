'use client';

import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';

interface Trait {
    layerId: string;
    traitId: string;
    hex: string;
}

interface VirusEngineProps {
    level: number;
    genome: Trait[];
    synergyScore: number;
}

// Linear Evolution Architecture
// Render order (back → front): Background → Master Sprite → FX
const LAYER_ORDER = [
    'background_layer',
    'master_sprite',
    'fx_layer'
];

const VirusEngine: React.FC<VirusEngineProps> = ({ level, genome, synergyScore }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const layersRef = useRef<{ [key: string]: PIXI.Sprite | PIXI.Graphics }>({});

    // Fallback drawing if textures aren't loaded yet (for MVP demo without PNGs)
    const drawFallbackShape = (g: PIXI.Graphics | PIXI.Sprite, layerId: string, colorHex: string, level: number) => {
        if (!(g instanceof PIXI.Graphics)) return;
        g.clear();
        const color = parseInt(colorHex.replace('#', ''), 16);
        const baseSize = 40 + level * 5;

        g.beginFill(color, 1);

        switch (layerId) {
            case 'background_layer':
                g.beginFill(color, 0.2);
                g.drawRect(-190, -190, 380, 380); // Full canvas size fallback
                break;
            case 'master_sprite':
                // Complex fallback shape based on level
                g.beginFill(color, 1);
                g.drawEllipse(0, 0, baseSize, baseSize * 0.8); // Body
                if (level >= 3) {
                    g.drawPolygon([-baseSize, 0, -baseSize - 40, -40, -baseSize, 30]); // Wings left
                    g.drawPolygon([baseSize, 0, baseSize + 40, -40, baseSize, 30]); // Wings right
                }
                if (level >= 6) {
                    g.drawCircle(0, -baseSize * 0.7, baseSize * 0.4); // Head
                }
                if (level >= 9) {
                    // Aura / Extra spikiness
                    g.lineStyle(4, 0xffffff, 0.5);
                    g.drawCircle(0, 0, baseSize * 1.5);
                }
                // Eyes for personality
                g.beginFill(0xffffff);
                g.drawCircle(-15, -10, 8);
                g.drawCircle(15, -10, 8);
                g.beginFill(0x000000);
                g.drawCircle(-15, -10, 4);
                g.drawCircle(15, -10, 4);
                break;
            case 'fx_layer':
                // Particle visual
                g.beginFill(color, 0.8);
                for (let i = 0; i < 5; i++) {
                    g.drawCircle((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150, 3);
                }
                break;
        }
        g.endFill();
    };

    const applyMorphing = async () => {
        // We use an async loop to load textures
        for (const trait of genome) {
            const layerId = trait.layerId;
            const layer = layersRef.current[layerId];
            if (!layer) continue;

            if (layerId === 'master_sprite') {
                try {
                    // Extract level from traitId (e.g. monster_lvl5_v1)
                    // But we only have variant 1 right now, so we map to the exact filenames we just copied
                    const lvlMatch = trait.traitId.match(/lvl(\d+)/);
                    const lvl = lvlMatch ? lvlMatch[1] : level;

                    // Specific mapping for the new truly transparent PNG files:
                    const fileMap: Record<number, string> = {
                        0: 'level0_variant1_inferno_egg.png',
                        1: 'level1_variant1_inferno_baby.png',
                        2: 'level2_variant1_inferno_intraining.png',
                        3: 'level3_variant1_inferno_rookie.png',
                        4: 'level4_variant1_inferno_champion.png',
                        5: 'level5_variant1_inferno_ultimate.png',
                        6: 'level6_variant1_inferno_mega.png',
                        7: 'level7_variant1_inferno_ultra.png',
                        8: 'level8_variant1_inferno_superultimate.png',
                        9: 'level9_variant1_inferno_god.png',
                        10: 'level9_variant1_inferno_god.png' // fallback for lvl 10
                    };

                    const fileName = fileMap[parseInt(lvl as string)];

                    if (fileName) {
                        const texture = await PIXI.Assets.load(`/assets/monsters/${fileName}`);
                        const sprite = layer as PIXI.Sprite;
                        sprite.texture = texture;
                        sprite.anchor.set(0.5);

                        // Scale down large JPEGs to fit the 380x380 canvas nicely
                        sprite.scale.set(0.3);

                        // Original coloring preserved (no tinting)
                        sprite.tint = 0xFFFFFF;

                        // GSAP Cinematic Morphing effect (Scale pop & wobble)
                        gsap.fromTo(sprite.scale,
                            { x: 0.1, y: 0.5 },
                            { x: 0.3, y: 0.3, duration: 0.8, ease: "elastic.out(1, 0.3)" }
                        );
                    }
                } catch (e) {
                    console.error("Failed to load texture for", trait.traitId, e);
                }
            } else if (layerId === 'background_layer') {
                try {
                    const bgMap: Record<string, string> = {
                        'bg_digital_void': 'bg_digital_void.png',
                        'bg_biohazard_lab': 'bg_biohazard_lab.png',
                        'bg_cosmic_nebula': 'bg_cosmic_nebula.png',
                        'bg_cyber_city': 'bg_cyber_city.png',
                        'bg_frozen_data': 'bg_frozen_data.png',
                        'bg_molten_core': 'bg_molten_core.png',
                        'bg_glitch_server': 'bg_glitch_server.png',
                        'bg_zen_bridge': 'bg_zen_bridge.png',
                        'bg_deep_sea': 'bg_deep_sea.png',
                        'bg_float_island': 'bg_float_island.png',
                        'bg_solar_flare': 'bg_solar_flare.png',
                        'bg_obsidian_monolith': 'bg_obsidian_monolith.png',
                        'bg_aurora_portal': 'bg_aurora_portal.png',
                        'bg_crystal_cave': 'bg_crystal_cave.png',
                        'bg_neon_forest': 'bg_neon_forest.png',
                        'bg_storm_clouds': 'bg_storm_clouds.png',
                        'bg_clockwork_void': 'bg_clockwork_void.png',
                        'bg_toxic_marsh': 'bg_toxic_marsh.png',
                        'bg_cyber_graveyard': 'bg_cyber_graveyard.png',
                        'bg_data_cathedral': 'bg_data_cathedral.png',
                        'bg_glitch_desert': 'bg_glitch_desert.png',
                        'bg_circuit_city': 'bg_circuit_city.png',
                        'bg_virtual_library': 'bg_virtual_library.png',
                        'bg_space_hub': 'bg_space_hub.png'
                    };
                    const fileName = bgMap[trait.traitId];
                    const sprite = layer as PIXI.Sprite;

                    if (fileName) {
                        const texture = await PIXI.Assets.load(`/assets/backgrounds/${fileName}`);
                        sprite.texture = texture;
                        sprite.anchor.set(0.5);

                        // Scale image to cover the 380x380 screen
                        const scaleFactor = Math.max(380 / texture.width, 380 / texture.height);
                        sprite.scale.set(scaleFactor);

                        // Slight dimming so monster pops out more
                        sprite.alpha = 0.8;
                    } else if (sprite.texture) {
                        sprite.texture = PIXI.Texture.EMPTY;
                    }
                } catch (e) {
                    console.error("Failed to load bg texture", e);
                }
            } else if (layer instanceof PIXI.Graphics) {
                // FX remain shapes for now
                drawFallbackShape(layer, layerId, trait.hex, level);
            }
        }
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const initApp = async () => {
            if (appRef.current) return;
            const app = new PIXI.Application();
            // @ts-ignore
            await app.init({
                width: 380,
                height: 380,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                antialias: true,
            });

            appRef.current = app;
            containerRef.current?.appendChild(app.canvas);

            const virusContainer = new PIXI.Container();
            virusContainer.x = app.screen.width / 2;
            virusContainer.y = app.screen.height / 2;
            app.stage.addChild(virusContainer);

            // Layering Architecture based on Blueprint
            LAYER_ORDER.forEach((id) => {
                let layerObject;
                if (id === 'master_sprite' || id === 'background_layer') {
                    layerObject = new PIXI.Sprite();
                    layerObject.anchor.set(0.5);
                } else {
                    layerObject = new PIXI.Graphics();
                }
                layersRef.current[id] = layerObject;
                virusContainer.addChild(layerObject);
            });

            // GSAP Breathing Animation (Alive!)
            gsap.to(virusContainer.scale, {
                x: 1.05, y: 0.95,
                duration: 2,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
            });

            // Initial render
            applyMorphing();
        };

        initApp();

        return () => {
            if (appRef.current) {
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        applyMorphing();
    }, [genome, level]);

    return (
        <div className="flex flex-col items-center justify-center p-2 bg-black/40 rounded-xl border-2 border-[#00ffcc]/30 shadow-[0_0_30px_rgba(0,255,204,0.2)] backdrop-blur-xl relative overflow-hidden group clip-path-[polygon(20px_0,100%_0,100%_calc(100%-20px),calc(100%-20px)_100%,0_100%,0_20px)] w-[360px] h-[400px]">
            {/* Corner Bracket Accents */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#00ffcc]"></div>
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#00ffcc]"></div>

            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,204,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,204,0.05)_1px,transparent_1px)] bg-[size:20px_20px] -z-10 group-hover:opacity-100 transition-opacity duration-1000 opacity-50" />

            <div ref={containerRef} className="overflow-hidden filter drop-shadow-[0_0_20px_rgba(0,255,204,0.4)] absolute top-10" />

            <div className="absolute bottom-4 left-0 right-0 text-center pb-2 bg-gradient-to-t from-black via-black/80 to-transparent pt-8">
                <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-[#00ffcc]/50" />
                    <h3 className="text-[11px] font-black text-[#ffffff] tracking-[0.5em] uppercase drop-shadow-[0_0_5px_rgba(0,255,204,1)]">STAGE {level} ORGANISM</h3>
                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-[#00ffcc]/50" />
                </div>
                <p className="text-[9px] text-[#00ffcc] font-black tracking-[0.3em] uppercase opacity-80">DATA BLOCK: {genome.length} Traits</p>
                <p className="text-[9px] text-[#0088ff] font-black tracking-[0.3em] uppercase opacity-80">POWER LVL: {synergyScore.toFixed(3)}</p>
            </div>
        </div>
    );
};

export default VirusEngine;

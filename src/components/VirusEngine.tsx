'use client';

import React, { useEffect, useRef, useMemo } from 'react';
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
    const isMorphingRef = useRef(false);
    const isInitializedRef = useRef(false);
    const initializingRef = useRef(false);

    // ADMIN SIMULATION / AUTO-RECOVERY:
    // Ensure we ALWAYS have at least one trait for Background, Monster, and FX.
    // Merge the player's actual genome with a set of defaults.
    const effectiveGenome = useMemo(() => {
        const defaults: Trait[] = [
            { layerId: 'background_layer', traitId: 'bg_digital_void', hex: '#000000' },
            { layerId: 'master_sprite', traitId: `monster_lvl${level}_v1`, hex: '#00ffcc' },
            { layerId: 'fx_layer', traitId: 'fx_none', hex: '#ffffff' }
        ];

        if (!genome || genome.length === 0) return defaults;

        // Map existing traits by layerId
        const traitMap = new Map(genome.map(t => [t.layerId, t]));

        // Merge: Use player trait if it exists, otherwise use default
        return LAYER_ORDER.map(layerId => {
            return traitMap.get(layerId) || defaults.find(d => d.layerId === layerId) || defaults[0];
        });
    }, [genome, level]);

    // Fallback drawing if textures aren't loaded yet
    const drawFallbackShape = (g: PIXI.Graphics | PIXI.Sprite, layerId: string, colorHex: string, currentLevel: number) => {
        let graphics: PIXI.Graphics;

        if (g instanceof PIXI.Sprite) return;
        else graphics = g;

        graphics.clear();
        const color = parseInt(colorHex.replace('#', ''), 16);
        const baseSize = 40 + currentLevel * 5;

        graphics.beginFill(color, 1);

        switch (layerId) {
            case 'background_layer':
                graphics.beginFill(color, 0.2);
                graphics.drawRect(-190, -190, 380, 380);
                break;
            case 'master_sprite':
                graphics.beginFill(color, 1);
                graphics.drawEllipse(0, 0, baseSize, baseSize * 0.8);
                graphics.beginFill(0xffffff);
                graphics.drawCircle(-15, -10, 8);
                graphics.drawCircle(15, -10, 8);
                break;
            case 'fx_layer':
                graphics.beginFill(color, 0.8);
                for (let i = 0; i < 5; i++) {
                    graphics.drawCircle((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150, 3);
                }
                break;
        }
        graphics.endFill();
    };

    const applyMorphing = async () => {
        if (!isInitializedRef.current || isMorphingRef.current) return;
        isMorphingRef.current = true;

        try {
            // We use an async loop to load textures
            for (const trait of effectiveGenome) {
                const layerId = trait.layerId;
                const layer = layersRef.current[layerId];
                if (!layer) continue;

                if (layerId === 'master_sprite') {
                    const sprite = layer as PIXI.Sprite;
                    sprite.texture = PIXI.Texture.EMPTY;

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
                            10: 'level9_variant1_inferno_god.png'
                        };

                        const fileName = fileMap[parseInt(lvl as string)];
                        if (fileName) {
                            // Using a cache-busting loader or simple PIXI texture load
                            const texture = await PIXI.Assets.load(`/assets/monsters/${fileName}?v=${Date.now()}`);
                            if (texture) {
                                sprite.texture = texture;
                                sprite.anchor.set(0.5);

                                // Reliable Scale Calculation - INCREASED BY 100% (Doubled from 280 to 560)
                                const baseScale = Math.min(560 / texture.width, 560 / texture.height);
                                const finalScale = isFinite(baseScale) && baseScale > 0 ? baseScale : 0.6;

                                sprite.scale.set(finalScale);
                                sprite.tint = 0xFFFFFF;
                                sprite.alpha = 1;

                                gsap.fromTo(sprite.scale,
                                    { x: finalScale * 0.5, y: finalScale * 1.5 },
                                    { x: finalScale, y: finalScale, duration: 1.2, ease: "elastic.out(1, 0.3)" }
                                );
                            }
                        }
                    } catch (e) {
                        console.error("Failed to load monster texture", e);
                        // ABSOLUTE FALLBACK: If PNG fails, draw a placeholder shape so the user sees something
                        const g = new PIXI.Graphics();
                        drawFallbackShape(g, 'master_sprite', trait.hex, level);
                        const tex = appRef.current?.renderer.generateTexture(g);
                        if (tex) {
                            sprite.texture = tex;
                            sprite.scale.set(1);
                        }
                    }
                } else if (layerId === 'background_layer') {
                    const sprite = layer as PIXI.Sprite;
                    sprite.texture = PIXI.Texture.EMPTY;

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
                        const fileName = bgMap[trait.traitId] || `${trait.traitId}.png`;
                        if (fileName) {
                            const texture = await PIXI.Assets.load(`/assets/backgrounds/${fileName}`);
                            if (texture) {
                                sprite.texture = texture;
                                sprite.anchor.set(0.5);
                                const scaleFactor = Math.max(380 / texture.width, 380 / texture.height);
                                sprite.scale.set(isFinite(scaleFactor) ? scaleFactor : 1);
                                sprite.alpha = 0.8;
                            }
                        }
                    } catch (e) {
                        console.error("Failed to load bg texture", e);
                    }
                } else if (layer instanceof PIXI.Graphics) {
                    // FX remain shapes for now
                    drawFallbackShape(layer, layerId, trait.hex, level);
                }
            }
        } finally {
            isMorphingRef.current = false;
        }
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const initApp = async () => {
            // Strict singleton check
            if (appRef.current || initializingRef.current) return;
            initializingRef.current = true;

            try {
                // Absolute cleanup of previous canvases
                if (containerRef.current) containerRef.current.innerHTML = '';

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

                const bgContainer = new PIXI.Container();
                bgContainer.zIndex = 0;
                app.stage.addChild(bgContainer);

                const virusContainer = new PIXI.Container();
                virusContainer.zIndex = 10;
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

                    // FIX: Background stays static, monster/fx breathe
                    if (id === 'background_layer') {
                        layerObject.x = app.screen.width / 2;
                        layerObject.y = app.screen.height / 2;
                        bgContainer.addChild(layerObject);
                    } else {
                        virusContainer.addChild(layerObject);
                    }
                });

                // Stage needs sortable children for zIndex to work
                app.stage.sortableChildren = true;

                // GSAP Breathing Animation (Only for the virus, not the background!)
                gsap.to(virusContainer.scale, {
                    x: 1.05, y: 0.95,
                    duration: 2,
                    repeat: -1,
                    yoyo: true,
                    ease: "sine.inOut"
                });

                isInitializedRef.current = true;
                // Initial render
                await applyMorphing();
            } finally {
                initializingRef.current = false;
            }
        };

        initApp();

        return () => {
            if (appRef.current) {
                isInitializedRef.current = false;
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
                layersRef.current = {};
            }
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, []);

    useEffect(() => {
        applyMorphing();
    }, [genome, level, effectiveGenome]);

    return (
        <div className="flex flex-col items-center justify-center p-0 bg-black/40 rounded-xl border-2 border-[#00ffcc]/30 shadow-[0_0_30px_rgba(0,255,204,0.2)] backdrop-blur-xl relative overflow-hidden group clip-path-[polygon(20px_0,100%_0,100%_calc(100%-20px),calc(100%-20px)_100%,0_100%,0_20px)] w-[380px] h-[380px]">
            {/* Corner Bracket Accents */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#00ffcc]"></div>
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#00ffcc]"></div>

            <div ref={containerRef} className="overflow-hidden filter drop-shadow-[0_0_20px_rgba(0,255,204,0.4)] absolute inset-0" />

            <div className="absolute bottom-0 left-0 right-0 text-center pb-4 pt-10 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-[#00ffcc]/50" />
                    <h3 className="text-[11px] font-black text-[#ffffff] tracking-[0.5em] uppercase drop-shadow-[0_0_5px_rgba(0,255,204,1)]">STAGE {level} ORGANISM</h3>
                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-[#00ffcc]/50" />
                </div>
                <p className="text-[9px] text-[#00ffcc] font-black tracking-[0.3em] uppercase opacity-80">GENOME: {genome.length} Data Blocks</p>
                <p className="text-[9px] text-[#0088ff] font-black tracking-[0.3em] uppercase opacity-80">SYNC LVL: {synergyScore.toFixed(3)}</p>
            </div>
        </div>
    );
};

export default VirusEngine;

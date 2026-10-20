export type VehicleType='sedan'|'hatchback'|'van'|'smallTruck'|'lorry'|'tractor'|'mpv'|'sports';
export const VEHICLES:Record<VehicleType,{name:string;width:number;length:number;height:number;wheel:number;mass:number}>={
  sedan:{name:'小客车',width:1.90,length:4.5,height:1.45,wheel:0.34,mass:1650},
  hatchback:{name:'两厢客车',width:1.78,length:3.9,height:1.52,wheel:0.32,mass:1300},
  van:{name:'面包车',width:2.02,length:5.3,height:2.20,wheel:0.38,mass:2400},
  smallTruck:{name:'小货车',width:2.12,length:6.5,height:3.00,wheel:0.43,mass:4200},
  lorry:{name:'大货车',width:2.45,length:10.2,height:3.65,wheel:0.52,mass:12000},
  tractor:{name:'半挂牵引车',width:2.48,length:14.5,height:3.85,wheel:0.54,mass:22000},
  mpv:{name:'V800',width:2.05,length:5.6,height:1.90,wheel:0.38,mass:3000},
  sports:{name:'SU7',width:1.96,length:5.0,height:1.45,wheel:0.36,mass:2200},
};
export const centerHeight=(type:VehicleType)=>(VEHICLES[type].height+0.32)/2;

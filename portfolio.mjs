const RANGES = [
 {id:'0-10',label:'0–<10 บาท',min:0,max:10},
 {id:'10-50',label:'10–<50 บาท',min:10,max:50},
 {id:'50-100',label:'50–<100 บาท',min:50,max:100},
 {id:'100-150',label:'100–<150 บาท',min:100,max:150},
 {id:'150-200',label:'150–<200 บาท',min:150,max:200},
 {id:'200+',label:'200+ บาท',min:200,max:Infinity}
];
export function portfolioPrice(result){
 if(Number.isFinite(result?.currentPrice)&&result.currentPrice>0)return result.currentPrice;
 return Number.isFinite(result?.price)&&result.price>0?result.price:null;
}
// Weight uses market value (latest available price × shares), never share price alone.
export function groupPortfolio(held,by,quantity){
 const groups=RANGES.map(r=>({...r,symbols:[],value:0,unvalued:0}));
 const unknown={id:'unknown',label:'ยังไม่มีราคา',symbols:[],value:0,unvalued:0};
 let total=0,unvalued=0;
 for(const sym of [...new Set(held)].sort()){
  const price=portfolioPrice(by[sym]),q=quantity(sym);
  const group=price===null?unknown:groups.find(r=>price>=r.min&&price<r.max);
  group.symbols.push(sym);
  if(price!==null&&Number.isFinite(q)&&q>0&&Number.isFinite(price*q)){
   const value=price*q;group.value+=value;total+=value;
  }else{group.unvalued++;unvalued++}
 }
 if(unknown.symbols.length)groups.push(unknown);
 for(const group of groups)group.weight=total>0?group.value/total*100:null;
 return {groups,total,unvalued};
}

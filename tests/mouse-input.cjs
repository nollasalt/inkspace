// Electron does not infer held buttons for injected mouseMove events. Preserve
// them so pointer capture/cancel matches physical mouse input.
module.exports=function mouseInput(contents){
  const send=contents.sendInputEvent.bind(contents),held=new Set();
  return event=>{
    const button=event.button||'left';
    if(event.type==='mouseDown')held.add(button);
    if(event.type==='mouseUp')held.delete(button);
    const modifiers=[...(event.modifiers||[])];
    if(event.type==='mouseMove')for(const name of held)modifiers.push(name+'buttondown');
    send({...event,modifiers});
  };
};
